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
