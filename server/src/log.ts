/**
 * Caviardage des URL avant journalisation.
 *
 * Fastify journalise l'URL de CHAQUE requête. Or plusieurs de nos URL portent
 * une capacité en clair :
 *   · `/api/invitations/token/<jeton>` — le jeton fait entrer dans le cercle
 *     d'un enfant (aperçu public, puis acceptation) ;
 *   · `/api/auth/magic-link/verify?token=<jeton>` — le jeton ouvre une session.
 * Ces lignes partaient telles quelles dans `docker logs`. Fermer `notify.ts`
 * sans fermer le journal des requêtes n'aurait servi à rien : le lien serait
 * simplement réapparu une ligne plus bas, au moment où le proche clique.
 *
 * On caviarde donc à la source, dans le sérialiseur du logger : ni le chemin ni
 * la chaîne de requête ne sortent avec leur secret. La route reste lisible pour
 * le diagnostic (on garde `/api/invitations/token/<caviardé>`), c'est la VALEUR
 * qui disparaît.
 */

/**
 * Ce qui remplace un secret dans un log. ASCII pur et sans caractère réservé :
 * `URLSearchParams.toString()` ré-encode ce qu'il rend, et un masque accentué
 * ou entre chevrons ressortait en `%3Ccaviard%C3%A9%3E` — illisible pour
 * l'exploitant, et assez proche d'une vraie valeur encodée pour semer le doute.
 */
const MASK = "REDACTED";

/**
 * Paramètres de requête dont la valeur est un secret. Volontairement large :
 * un paramètre qui s'appelle `token` n'a aucune raison d'être lisible dans un
 * journal, quel que soit celui qui l'a ajouté.
 */
const SECRET_PARAM = /^(token|secret|key|password|code|hash)$/i;

/**
 * Segments de chemin dont le SUIVANT est un secret. `/token/<jeton>` couvre les
 * routes d'invitation ; la liste est faite pour grandir avec les routes.
 */
const SECRET_AFTER = new Set(["token", "magic-link", "reset-password"]);

/**
 * Verbes de route qui suivent un segment « à secret » sans en être un. Sans
 * cette liste, `/api/auth/magic-link/verify` devenait
 * `/api/auth/magic-link/REDACTED` : on perdait QUELLE opération avait eu lieu
 * (demander un lien ou le vérifier) alors que le secret, lui, est dans la query.
 * Sur-caviarder ne fuit rien, mais ça rend un journal inutilisable.
 */
const SAFE_SEGMENT = new Set(["verify", "send", "callback", "accept"]);

/**
 * Renvoie l'URL sans ses secrets. Accepte une URL relative (ce que Fastify
 * donne : `req.url` est un chemin) comme absolue, et ne lève jamais : une URL
 * qu'on n'arrive pas à analyser est renvoyée entièrement caviardée plutôt que
 * telle quelle — dans le doute, on ne journalise pas.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  try {
    const [rawPath, ...rest] = url.split("?");
    const query = rest.join("?");

    const segments = rawPath.split("/").map((seg, i, all) => {
      const previous = i > 0 ? all[i - 1] : "";
      return seg && SECRET_AFTER.has(previous) && !SAFE_SEGMENT.has(seg)
        ? MASK
        : seg;
    });
    const path = segments.join("/");

    if (!query) return path;

    // `URLSearchParams` réécrit la chaîne (encodage, ordre des `&`) : c'est
    // voulu, on journalise une forme normalisée, pas la chaîne d'origine.
    const params = new URLSearchParams(query);
    for (const name of [...params.keys()])
      if (SECRET_PARAM.test(name)) params.set(name, MASK);
    const rendered = params.toString();
    return rendered ? `${path}?${rendered}` : path;
  } catch {
    return MASK;
  }
}

/**
 * CE QU'UNE PANNE A LE DROIT DE DIRE — décidé ici, appliqué dans `app.ts`.
 *
 * Fastify renvoie au client le MESSAGE de l'erreur, tel quel. Sur une erreur de
 * base, ce message EST la requête : `Failed query: select "memberships"…`
 * partait donc au client à chaque 500 — noms de tables, de colonnes, forme des
 * jointures —, déclenchable depuis n'importe quelle URL portant un identifiant
 * mal formé (mesuré sur `/api/children/pas-un-uuid/members`).
 *
 * Trois cas, et une seule règle : l'exploitant garde le détail, le client
 * reçoit ce qu'il peut en faire.
 *
 *  · `22P02` (« invalid input syntax ») — un identifiant qui n'a pas la forme
 *    d'un UUID n'est pas une panne du serveur, c'est une demande mal formée.
 *    400, sans renvoyer en écho la chaîne fautive.
 *  · 5xx — une phrase générique. Le diagnostic vit dans le journal.
 *  · le reste — les refus que Fastify fabrique lui-même (limite de débit, corps
 *    trop gros, JSON invalide) portent déjà un statut et une phrase écrite pour
 *    être lue : on ne les touche pas.
 *
 * Fonction PURE, pour que la règle se vérifie sans serveur ni base.
 */
export function describeFailure(err: unknown): {
  status: number;
  body: { error: string };
  /** Le journal doit-il porter la trace complète (5xx) ou une simple alerte ? */
  severity: "error" | "warn";
} {
  if (sqlStateOf(err) === "22P02")
    return {
      status: 400,
      body: { error: "identifiant invalide" },
      severity: "warn",
    };

  const status = (err as { statusCode?: unknown })?.statusCode;
  const code = typeof status === "number" ? status : 500;

  if (code >= 500)
    return { status: code, body: { error: "erreur interne" }, severity: "error" };

  const message = (err as { message?: unknown })?.message;
  return {
    status: code,
    body: {
      error:
        typeof message === "string" && message ? message : "requête refusée",
    },
    severity: "warn",
  };
}

/**
 * Le code SQLSTATE d'une erreur, où qu'il se trouve dans la chaîne des causes :
 * Drizzle enveloppe l'erreur du pilote, et le code vit sur `cause`.
 * Recopié de l'adaptateur des journées à dessein — `log.ts` ne doit dépendre ni
 * de Drizzle, ni d'un dépôt, pour rester chargeable partout.
 */
function sqlStateOf(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return "";
}
