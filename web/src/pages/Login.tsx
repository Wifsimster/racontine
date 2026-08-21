import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Inbox,
  KeyRound,
  Mail,
  MailCheck,
  NotebookPen,
  RotateCcwKey,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginBackground } from "@/components/LoginBackground";

/* ===========================================================================
   L'ouverture du carnet.

   C'est le premier écran de l'app, et le SEUL que voient les proches avant de
   nous confier la journée de leur petit-enfant. Il est donc dessiné comme une
   page de carnet, pas comme un formulaire de SaaS :

   · le contenu est ALIGNÉ À GAUCHE sur le trait de marge groseille, comme une
     page qu'on commence à écrire — un bloc centré au milieu du vide est la
     signature du formulaire de connexion générique ;
   · UN SEUL axe de texte, à 40 px : le surtitre, le nom, la promesse, les
     libellés de la feuille, le pied de page. La feuille elle-même est décalée
     de 16 px vers la gauche (`-ml-4`) pour que son bord vienne se poser SUR le
     trait de marge (24 px) : elle n'est plus une carte qui flotte avec sa
     propre colonne 21 px plus à droite, elle est reliée à la marge comme une
     page l'est à sa couture. Son bord gauche est carré et le trait de marge est
     redessiné DANS la feuille (`MargeRule`) pour que l'axe traverse l'écran
     d'un bord à l'autre sans être interrompu par un coin arrondi ;
   · le bandeau n'a pas de pictogramme : le nom EST la marque, en Fraunces
     30/36. Un logo de livre à côté d'un mot en sérif, c'est un gabarit de
     landing page ;
   · la phrase-promesse est réglée en 17/28 et sa ligne de base tombe SUR la
     première ligne du cahier, que le fond ne dessine qu'à partir d'elle (voir
     `LoginBackground`) : le texte est posé sur le papier, pas devant ;
   · DEUX PORTES sont visibles d'emblée, parce qu'il y a deux publics : le
     parent qui a un mot de passe, et le proche invité qui n'en aura jamais et
     se connecte par lien e-mail.

   Une QUATRIÈME porte s'ouvre depuis la première, sans jamais s'imposer : le
   mot de passe oublié. Elle n'était pas là, et son absence coûtait cher — le
   seul secours affiché était « recevoir un lien par e-mail », c'est-à-dire un
   MAGIC LINK, qui ouvre une session et ne touche pas au mot de passe. On
   demandait à le réinitialiser, on recevait un lien de connexion, et le mot de
   passe restait oublié. Les deux besoins ont donc chacun leur affordance
   (« Mot de passe oublié ? » sous le champ, « Recevoir un lien par e-mail »
   après la séparation), chacun leur e-mail, et chacun leur accusé de réception.

   Quatre portes au total (`Door`), un seul écran, aucune navigation.

   COULEUR : le groseille ne dit que deux choses ici, et elles ne se confondent
   pas — l'ACTION (une surface pleine : le bouton) et l'IDENTITÉ du carnet (un
   trait : la marge, le halo du nom). Le lien d'inscription, lui, est repassé à
   l'ENCRE soulignée : c'est une note de bas de page, pas une action, et le
   groseille portait trois métiers à la fois. L'ambre et le rouge d'état ne
   sortent que pour une erreur, le vert que pour la confirmation « le lien est
   parti ». Les cinq feutres de catégorie n'ont RIEN à faire ici.

   TYPOGRAPHIE : six crans, pas un de plus — 30/36 (nom), 22/28 (titre de
   feuille), 17/28 (promesse, récit, champs), 15/20 (libellés, boutons), 13/20
   (indices), 11/16 (surtitre). Apostrophes courbes et espace insécable avant
   les deux-points : c'est le premier écran, il est composé, pas tapé.

   ── Ce que la ronde 2 corrige, et pourquoi c'est ici ──────────────────────

   1. I1 NON-TEXTE. Le bord des champs mesurait 1,51:1 en clair et 1,90:1 en
      sombre sur `--card`, pour 3:1 exigés (WCAG 1.4.11) : le seul objet de
      l'écran où l'on doit AGIR n'avait pas de contour visible. La valeur juste
      vit dans `--input` (index.css), qui n'est pas dans le périmètre de fichiers
      de cette ronde ; on la POSE donc sur la racine de l'écran, sous le même
      nom de jeton, pour que tout ce qui écrit `border-input` en hérite — les
      champs comme les boutons `outline`, qui avaient exactement le même défaut.
      Mesuré : rgb(140 142 152) sur `--card` = 3,21:1 en clair ;
      rgb(110 112 120) (l'exact composé de blanc à 36 % sur la feuille de nuit)
      = 3,28:1 en sombre. La même paire de valeurs doit remonter dans index.css
      dès que ce fichier est ouvrable — ici elle est scopée, pas dupliquée.
      Le champ reçoit en plus l'intérieur du PAPIER (`bg-background`) au lieu de
      celui de la feuille (`bg-card`) : un champ est un creux dans la page.
      Les trois crans du champ restent distincts : repos 3,2:1 → focus 6,0:1
      (`--ring`, 2 px) → fautif 6,5:1 (`--destructive`).

   2. I9. Le CTA en attente affichait `Loader2 animate-spin`, une boucle de
      1000 ms linéaire jamais déclarée au budget mouvement — celle que les
      pièces timeline et capture ont supprimée. Elle disparaît : le libellé
      porte l'attente (« Connexion… ») et une barre en DEUX PAS, immobile, dit
      où l'on en est (« demande partie » en groseille, « réponse attendue » au
      gris mesuré du système). Aucune animation, donc rien à arrêter sous
      `prefers-reduced-motion`, et rien qui grimpe faussement.

   3. I8 / clavier. Le bouton n'est plus `disabled` pendant la requête mais
      `aria-disabled` + `aria-busy` : il garde le focus (avant, il était blurré
      et `document.activeElement` retombait sur `<body>`, renvoyant en haut du
      document la personne qui venait de valider au clavier) et il garde SA
      COULEUR — pendant l'attente, l'action restait la seule chose grise de
      l'écran. Toute erreur déplace en outre le focus sur le champ fautif, et
      le champ fautif est décrit par la tuile d'erreur (`aria-describedby`).
      Enfin, passer d'une porte à l'autre met le focus sur le premier champ vide
      de la nouvelle porte : sur la porte du lien, taper son adresse est la
      seule chose à faire, elle ne coûte plus un tap de plus.
   =========================================================================== */

type Door = "password" | "magic" | "signup" | "forgot";
type FieldId = "name" | "email" | "password";

/** Un problème EXPLIQUÉ : la cause (le message serveur), le remède, une issue. */
type Problem = {
  /** Le message brut du serveur — jamais une exception, jamais un code nu. */
  cause: string;
  /** Ce que la personne peut faire, en une phrase. */
  remedy: string;
  /** Quel champ est en cause : lui seul reçoit le bord rouge + `aria-invalid`.
   *  Signaler les deux champs quand un seul est vide, c'est faire chercher. */
  field: "email" | "password" | "both" | null;
};

/** L'identifiant de la tuile d'erreur : les champs fautifs la citent. */
const PROBLEM_ID = "probleme-connexion";

const NETWORK: Problem = {
  cause: "Impossible de joindre votre instance Racontine.",
  remedy: "Vérifiez votre connexion, puis réessayez : rien n’a été envoyé.",
  field: null,
};

function problemFor(raw: string | undefined, door: Door): Problem {
  if (door === "forgot")
    return {
      cause: raw ?? "L’envoi du lien a échoué.",
      remedy:
        "Vérifiez l’orthographe : c’est l’adresse avec laquelle vous vous connectez.",
      field: "email",
    };
  if (door === "magic")
    return {
      cause: raw ?? "L’envoi du lien a échoué.",
      remedy:
        "Vérifiez l’orthographe : c’est l’adresse à laquelle l’invitation a été envoyée.",
      field: "email",
    };
  if (door === "signup")
    return {
      cause: raw ?? "La création du compte a échoué.",
      remedy:
        "Le mot de passe doit faire 8 caractères au moins. Si cette adresse a déjà un compte, connectez-vous.",
      field: "password",
    };
  return {
    cause: raw ?? "La connexion a échoué.",
    remedy:
      "Vérifiez l’adresse et le mot de passe. Oublié ? Demandez un lien de réinitialisation. Jamais eu de mot de passe ? Recevez un lien de connexion.",
    field: "both",
  };
}

/** Ce champ-là est-il désigné par le problème en cours ? */
function flags(problem: Problem | null, id: "email" | "password") {
  return !!problem && (problem.field === id || problem.field === "both");
}

/** Les champs d'une porte, dans l'ordre de saisie. */
const FIELDS: Record<Door, FieldId[]> = {
  password: ["email", "password"],
  magic: ["email"],
  signup: ["name", "email", "password"],
  forgot: ["email"],
};

/** Cette porte demande-t-elle un mot de passe ? Les deux autres n'ont qu'une
 *  adresse — et c'est le seul endroit où la question se pose. */
function hasPassword(door: Door): boolean {
  return FIELDS[door].includes("password");
}

export default function Login() {
  /* ── OÙ L'ON ALLAIT ───────────────────────────────────────────────────────
     La coquille redirige ici en emportant la destination
     (`<Navigate state={{ from: location }}>`), et cet écran la jetait : la
     connexion menait toujours à `/`. Conséquence mesurée sur le parcours de
     lecture d'un proche : le lien « une nouvelle journée est en ligne » reçu par
     e-mail pointe sur `/entries/:id` ; déconnecté, on le suivait, on se
     connectait… et on atterrissait sur le journal, à charge de retrouver la
     journée soi-même. La destination est donc reprise, pour la redirection
     comme pour le lien magique.
     Deux garde-fous : uniquement un chemin INTERNE (jamais `//ailleurs.example`
     ni une URL absolue — un `callbackURL` est un vecteur de redirection
     ouverte), et jamais `/login` (boucle). */
  const location = useLocation();
  const next = useMemo(() => {
    const from = (
      location.state as { from?: { pathname?: string; search?: string } } | null
    )?.from;
    const p = from?.pathname;
    if (!p || !p.startsWith("/") || p.startsWith("//") || p === "/login")
      return "/";
    return p + (from?.search ?? "");
  }, [location.state]);

  const [door, setDoor] = useState<Door>("password");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  /** Lien envoyé : l'écran change de nature, il ne montre plus un formulaire. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** QUEL lien est parti. Les deux e-mails se ressemblent dans une boîte de
   *  réception ; l'accusé de réception, lui, doit dire lequel on attend et ce
   *  qu'il fera — se connecter, ou mener au choix d'un nouveau mot de passe. */
  const [sentKind, setSentKind] = useState<"magic" | "forgot">("magic");
  const [resent, setResent] = useState(false);

  const [appName, setAppName] = useState("Racontine");
  const [signupEnabled, setSignupEnabled] = useState(true);
  /* Chargement des réglages publics : l'écran est utilisable SANS eux (le nom
     par défaut est le bon dans la quasi-totalité des cas), donc pas de
     squelette pleine page — on RÉSERVE seulement la place du seul élément qui
     en dépend, l'affordance « créer un compte », et on y met un squelette à sa
     forme. Un écran de connexion qui saute au bout de 80 ms a l'air cassé ;
     un écran qui se cache derrière un spinner a l'air lent. */
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  /* Les champs sont tenus par référence pour une seule raison : ramener le
     FOCUS là où il sert (le champ fautif, le premier champ vide d'une porte).
     Rien n'est piloté par le DOM, la valeur reste dans l'état React. */
  const fields = useRef<Partial<Record<FieldId, HTMLInputElement | null>>>({});
  const alertRef = useRef<HTMLDivElement | null>(null);
  /** Vrai seulement quand la personne a elle-même changé de porte : on ne vole
   *  jamais le focus au chargement (clavier mobile qui s'ouvre tout seul). */
  const wantFocus = useRef(false);

  useEffect(() => {
    let alive = true;
    api
      .publicSettings()
      .then((s) => {
        if (!alive) return;
        setAppName(s.appName);
        setSignupEnabled(s.signupEnabled);
        if (!s.signupEnabled) setDoor((d) => (d === "signup" ? "password" : d));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setSettingsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* Changement de porte : le focus se pose sur le premier champ VIDE de la
     nouvelle porte. Dans un effet et non dans le gestionnaire de clic, parce
     que le champ n'existe pas encore au moment du clic. */
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const order = FIELDS[door];
    const first = order.find((id) => !fields.current[id]?.value) ?? order[0];
    fields.current[first]?.focus();
  }, [door]);

  function switchTo(next: Door) {
    wantFocus.current = true;
    setDoor(next);
    setProblem(null);
    setSentTo(null);
  }

  /** Un échec ne laisse jamais le focus nulle part : il va sur le champ à
   *  corriger, ou sur la tuile quand aucun champ n'est en cause (réseau). */
  function fail(p: Problem) {
    setProblem(p);
    const target: FieldId | null =
      p.field === "password" ? "password" : p.field === null ? null : "email";
    requestAnimationFrame(() => {
      if (target) fields.current[target]?.focus();
      else alertRef.current?.focus();
    });
  }

  async function sendMagicLink(target: string) {
    const res = await authClient.signIn.magicLink({
      email: target,
      callbackURL: next,
    });
    if (res.error) {
      fail(problemFor(res.error.message ?? undefined, "magic"));
      return false;
    }
    setSentKind("magic");
    setSentTo(target);
    return true;
  }

  /**
   * Le lien de RÉINITIALISATION — celui qui mène au choix d'un nouveau mot de
   * passe, et pas à une session ouverte. `redirectTo` est un chemin INTERNE
   * (même garde-fou que `next`) : le serveur vérifie le jeton, puis y redirige
   * en le repassant en query.
   *
   * Le serveur répond toujours OUI, même pour une adresse inconnue : c'est
   * voulu, sans quoi cet écran dirait qui a un compte sur l'instance. L'accusé
   * de réception est donc écrit au conditionnel, et il ne ment pas.
   */
  async function sendResetLink(target: string) {
    const res = await authClient.requestPasswordReset({
      email: target,
      redirectTo: "/reset-password",
    });
    if (res.error) {
      fail(problemFor(res.error.message ?? undefined, "forgot"));
      return false;
    }
    setSentKind("forgot");
    setSentTo(target);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Un champ vide n'a pas besoin d'un aller-retour serveur pour être signalé,
    // et surtout pas d'une bulle native : on rend NOTRE erreur, en français,
    // instantanément. (Le formulaire est `noValidate` exprès.)
    const trimmed = email.trim();
    const noPass = hasPassword(door) && !password;
    if (!trimmed || noPass) {
      fail({
        cause: "Il manque une information.",
        remedy: !trimmed
          ? door === "magic"
            ? "Entrez l’adresse e-mail à laquelle l’invitation a été envoyée."
            : "Entrez l’adresse e-mail de votre compte."
          : "Entrez votre mot de passe, ou demandez un lien par e-mail.",
        field: !trimmed && noPass ? "both" : !trimmed ? "email" : "password",
      });
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      if (door === "magic") {
        // On coupe les espaces : une adresse recopiée depuis un e-mail en
        // traîne presque toujours un, et l'erreur serveur serait incompréhensible.
        await sendMagicLink(trimmed);
      } else if (door === "forgot") {
        await sendResetLink(trimmed);
      } else {
        const res =
          door === "password"
            ? await authClient.signIn.email({ email: trimmed, password })
            : await authClient.signUp.email({
                email: trimmed,
                password,
                name,
              });
        if (res.error) fail(problemFor(res.error.message ?? undefined, door));
        else window.location.href = next;
      }
    } catch {
      fail(NETWORK);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sentTo || busy) return;
    setBusy(true);
    setResent(false);
    try {
      const sent =
        sentKind === "forgot"
          ? await sendResetLink(sentTo)
          : await sendMagicLink(sentTo);
      if (sent) setResent(true);
    } catch {
      fail(NETWORK);
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------- rendu --- */

  // Le libellé du bouton PORTE l'état d'attente (« Connexion… ») : il n'est
  // jamais remplacé par une roue, on ne perd donc pas ce qu'on a demandé.
  const cta =
    door === "forgot"
      ? busy
        ? "Envoi du lien…"
        : "Recevoir le lien"
      : door === "magic"
        ? busy
          ? "Envoi du lien…"
          : "Recevoir mon lien"
        : door === "signup"
          ? busy
            ? "Création du compte…"
            : "Créer mon carnet"
          : busy
            ? "Connexion…"
            : "Se connecter";

  const heading =
    door === "forgot"
      ? "Mot de passe oublié"
      : door === "magic"
        ? "Lien de connexion"
        : door === "signup"
          ? "Créer un compte"
          : "Connexion";

  return (
    <div
      /* `--input` posé ici, sous son propre nom : voir la note 1 en tête de
         fichier. Écrit en sRGB (jamais en `oklch()` ni via un modificateur
         d'opacité) pour rester mesurable par `getComputedStyle`. */
      className="relative isolate min-h-svh overflow-hidden pt-safe pb-safe [--input:rgb(140_142_152)] dark:[--input:rgb(110_112_120)]"
    >
      <LoginBackground />

      {/* La colonne de lecture : 26 rem au plus, un retrait gauche de 40 px
          (24 px de marge + 16 px de gouttière) qui pose le texte juste à droite
          du trait groseille, et un retrait droit plus court — une page de
          carnet n'est pas symétrique. Le retrait haut vaut 84 px = 3 x 28 :
          tout le bandeau reste ainsi sur la grille du papier. */}
      <div className="rise-enter mx-auto flex w-full max-w-[26rem] flex-col pt-[5.25rem] pr-5 pb-6 pl-10">
        {/* ── Le bandeau ─────────────────────────────────────────────────── */}
        <p className="surtitre text-muted-foreground">Carnet de liaison</p>
        <h1 className="mt-4 font-serif text-display font-semibold text-foreground">
          {appName}
        </h1>
        {/* Pas de `max-w` : la colonne EST la mesure (330 px à 390, soit ~45
            caractères), et la coupe tombe après la virgule au lieu de séparer
            « la journée » de « s’écrit ». */}
        <p className="carnet-story mt-4 text-foreground">
          {"Photographiez le carnet : la journée s’écrit, les proches la lisent."}
        </p>

        {/* ── La feuille ───────────────────────────────────────────────────── */}
        {sentTo ? (
          <LinkSent
            kind={sentKind}
            email={sentTo}
            resent={resent}
            busy={busy}
            onResend={resend}
            onChange={() => {
              setSentTo(null);
              setResent(false);
              wantFocus.current = true;
              // On revient à la porte d'où l'on vient : corriger l'adresse ne
              // doit pas changer la nature du lien qu'on attend.
              setDoor(sentKind === "forgot" ? "forgot" : "magic");
            }}
          />
        ) : (
          <form
            onSubmit={submit}
            className={SHEET}
            aria-labelledby="feuille-titre"
            noValidate
          >
            <MargeRule />
            <SheetTitle
              id="feuille-titre"
              icon={
                door === "forgot"
                  ? RotateCcwKey
                  : door === "magic"
                    ? Mail
                    : door === "signup"
                      ? NotebookPen
                      : KeyRound
              }
              title={heading}
            />

            {door === "magic" && (
              <p className="text-meta text-muted-foreground">
                {"Aucun mot de passe à retenir : nous vous envoyons un lien qui vous connecte au journal."}
              </p>
            )}

            {/* La porte du mot de passe oublié dit EXACTEMENT ce que fera le
                lien — parce que la porte d'à côté en envoie un autre, qui
                ressemble au premier dans une boîte de réception et qui, lui, ne
                touche pas au mot de passe. */}
            {door === "forgot" && (
              <p className="text-meta text-muted-foreground">
                {"Nous vous envoyons un lien qui mène au choix d’un nouveau mot de passe. Il ne vaut qu’une heure."}
              </p>
            )}

            {/* Les champs sont GROUPÉS à 16 px, les sections séparées à 20 px :
                l'écart dit ce qui va ensemble. */}
            <div className="flex flex-col gap-4">
              {door === "signup" && (
                <Field
                  id="name"
                  label="Votre nom"
                  value={name}
                  onChange={setName}
                  hold={fields}
                  /* Un EXEMPLE, pas une répétition du libellé : un champ vide
                     qui montre la forme de la réponse n'a plus l'air inachevé,
                     et le libellé reste au-dessus (il ne disparaît jamais à la
                     saisie, contrairement au « libellé flottant »). */
                  placeholder="Camille Durand"
                  autoComplete="name"
                  enterKeyHint="next"
                />
              )}

              <Field
                id="email"
                label="Adresse e-mail"
                type="email"
                value={email}
                onChange={setEmail}
                hold={fields}
                placeholder="vous@exemple.fr"
                autoComplete="email"
                inputMode="email"
                enterKeyHint={hasPassword(door) ? "next" : "send"}
                invalid={flags(problem, "email")}
              />

              {hasPassword(door) && (
                <Field
                  id="password"
                  label="Mot de passe"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  hold={fields}
                  /* Huit puces : la forme de la réponse ET le minimum exigé. */
                  placeholder="••••••••"
                  minLength={8}
                  autoComplete={
                    door === "signup" ? "new-password" : "current-password"
                  }
                  enterKeyHint="go"
                  invalid={flags(problem, "password")}
                  hint={
                    door === "signup" ? "8 caractères au minimum." : undefined
                  }
                />
              )}

              {/* LA SORTIE DU MOT DE PASSE OUBLIÉ EST ICI, collée au champ qui
                  vient de résister — pas en pied de page, et surtout pas
                  confondue avec la seconde porte. Avant, l'écran n'offrait
                  qu'un seul secours (« recevoir un lien par e-mail ») : on
                  demandait à changer son mot de passe, on recevait un lien de
                  CONNEXION, et le mot de passe restait oublié. Deux besoins
                  distincts, deux affordances distinctes, deux e-mails dont
                  l'objet ne se confond pas.
                  Réglée à l'ENCRE soulignée, comme l'affordance d'inscription :
                  c'est une note, pas l'action de l'écran — le groseille reste
                  au bouton. La cible fait 44 px de haut (taille `sm`) et son
                  bord gauche tombe sur l'axe de texte (`px-0`). */}
              {door === "password" && (
                <div className="-mt-1 flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start px-0 font-normal underline decoration-input decoration-1 underline-offset-4 hover:bg-transparent hover:decoration-foreground"
                    disabled={busy}
                    onClick={() => switchTo("forgot")}
                  >
                    {"Mot de passe oublié ?"}
                  </Button>
                </div>
              )}
            </div>

            {problem && <ProblemNote problem={problem} ref={alertRef} />}

            {/* L'action et son attente forment UN objet : 8 px, pas le pas de
                20 px des sections. */}
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                size="lg"
                /* Pendant l'attente : `aria-disabled`, PAS `disabled`. Le
                   bouton reste focusable (le clavier ne repart pas à zéro) et
                   garde le groseille de l'action — `disabled:bg-muted` lui
                   retirait la couleur de marque au moment précis où il est le
                   seul objet actif de l'écran. Le double clic est arrêté par la
                   garde `if (busy) return` de `submit`, et le survol ne fonce
                   plus (rien ne réagit pendant qu'on attend). */
                className="w-full aria-disabled:cursor-progress aria-disabled:hover:bg-primary"
                aria-busy={busy || undefined}
                aria-disabled={busy || undefined}
              >
                {cta}
              </Button>
              {busy && <WaitBar label={cta} />}
            </div>

            {door === "password" ? (
              <>
                {/* ── La seconde porte ─────────────────────────────────────
                    VISIBLE, pas cachée derrière un lien : c'est le chemin de
                    tous les proches, et ils n'ont pas de mot de passe à
                    deviner. */}
                <div className="flex items-center gap-3">
                  {/* Une LIGNE DU CAHIER (`--rule`), pas un filet
                      d'interface : la séparation appartient au papier. */}
                  <span className="h-px flex-1 bg-rule" aria-hidden="true" />
                  <span className="surtitre text-muted-foreground">ou</span>
                  <span className="h-px flex-1 bg-rule" aria-hidden="true" />
                </div>
                {/* La RAISON avant l'ACTION : un proche qui lit « je n'ai pas
                    de mot de passe » comprend le bouton d'en dessous. L'inverse
                    laissait la phrase en note de bas de feuille. */}
                <div className="flex flex-col gap-2">
                  <p className="text-meta text-muted-foreground">
                    {"Les proches invités n’ont pas de mot de passe."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => switchTo("magic")}
                  >
                    <Mail aria-hidden="true" />
                    Recevoir un lien par e-mail
                  </Button>
                </div>
              </>
            ) : (
              /* UNE seule sortie par porte. La version précédente en offrait
                 deux à l'inscription — ce bouton, plus « J'ai déjà un compte »
                 74 px plus bas : deux fois la même porte, deux fois le doute. */
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => switchTo("password")}
              >
                <ArrowLeft aria-hidden="true" />
                Revenir au mot de passe
              </Button>
            )}
          </form>
        )}

        {/* ── Pied de page : l'inscription, puis la promesse de discrétion ───
            L'affordance d'inscription n'apparaît que sur la porte du mot de
            passe : depuis les deux autres, la sortie est déjà DANS la feuille.
            Elle est réglée à l'ENCRE soulignée et non en groseille — le
            groseille est réservé à l'action et à l'identité du carnet, et une
            note de bas de page qui crie plus fort que le bouton, c'est ce qui
            arrivait pendant l'attente. */}
        {!sentTo && door === "password" && (
          <div className="mt-2 flex min-h-11 items-center">
            {!settingsLoaded ? (
              <span className="skeleton h-4 w-52" aria-hidden="true" />
            ) : signupEnabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                /* `px-0` : le BORD GAUCHE DE LA BOÎTE tombe à 40 px, sur l'axe
                   de texte de l'écran — pas seulement les glyphes. Le survol
                   n'allume donc pas un fond (il serrerait les lettres) : c'est
                   le soulignement qui fonce. La cible tactile fait quand même
                   44 px de haut (taille `sm`). */
                className="justify-start px-0 font-normal underline decoration-input decoration-1 underline-offset-4 hover:bg-transparent hover:decoration-foreground"
                disabled={busy}
                onClick={() => switchTo("signup")}
              >
                Créer un compte sur cette instance
              </Button>
            ) : (
              <p className="text-meta text-muted-foreground">
                {"Les inscriptions sont fermées : les proches invités arrivent par le lien reçu par e-mail."}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 text-meta text-muted-foreground">
          {/* mt-0.5 : demi-pas optique DÉCLARÉ (2 px). L'écart exact pour
              centrer une icône de 14 px sur une ligne de 20 px serait 3 px,
              mais 3 n'est pas un multiple de 2 : on prend 2, qui reste sur la
              grille et corrige l'essentiel du décalage. */}
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {"Instance privée : tout reste sur votre serveur."}
          </span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pièces --- */

/**
 * La FEUILLE : décalée de 16 px à gauche pour que son bord vienne se poser sur
 * le trait de marge, coin gauche carré (une page reliée n'a pas de coin arrondi
 * du côté de la couture), retrait intérieur gauche de 16 px pour que son contenu
 * retombe sur l'axe de texte à 40 px — le même que celui du bandeau et du pied
 * de page. `relative` parce que le trait de marge est redessiné à l'intérieur.
 */
const SHEET =
  "relative mt-7 -ml-4 flex flex-col gap-5 rounded-r-2xl border border-l-0 bg-card p-5 pl-4 shadow-card";

/**
 * Le trait de marge, REDESSINÉ sur le bord de la feuille. Le trait du fond
 * (`LoginBackground`) est à `-z-10` : la feuille, opaque, le masque sur toute sa
 * hauteur. Le redessiner ici — même largeur, même jeton — rend l'axe continu du
 * haut de l'écran au bas, à travers la feuille.
 */
function MargeRule() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-[1.5px]"
      style={{ background: "var(--rule-margin)" }}
    />
  );
}

/**
 * Le titre d'une feuille, avec sa tuile d'icône. La tuile est un repère NON
 * chromatique, et les TROIS portes ont trois glyphes distincts : la clé dit
 * « mot de passe », l'enveloppe « lien e-mail », le carnet-et-plume « créer mon
 * carnet » (il partageait la clé du mot de passe : le repère ne marchait qu'à
 * moitié). Seul l'accusé de réception passe au vert. On sait sur quelle porte on
 * est même en niveaux de gris.
 */
function SheetTitle({
  icon: Icon,
  title,
  tone = "neutral",
  id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: "neutral" | "done";
  id?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
          tone === "done"
            ? "bg-success-bg text-success"
            : "bg-muted text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <h2 id={id} className="font-serif text-title font-semibold">
        {title}
      </h2>
    </div>
  );
}

/**
 * L'attente, en DEUX PAS et sans une seule animation : la demande est partie
 * (groseille, le pas acquis), la réponse est attendue (le gris mesuré du
 * système, celui du bord des champs — 3,2:1 sur la feuille dans les deux
 * thèmes). C'est le vocabulaire de la barre d'envoi de la capture : « cette part
 * est acquise, cette part est en vol », lisible à l'arrêt, sur une capture figée
 * comme sous « moins de mouvement ». Pas de pourcentage qui grimpe, pas de roue
 * de 1000 ms hors budget.
 */
function WaitBar({ label }: { label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuetext="Demande envoyée — réponse attendue"
      className="flex h-1 gap-1"
    >
      <div className="h-full flex-1 rounded-full bg-primary" />
      <div className="h-full flex-1 rounded-full bg-input" />
    </div>
  );
}

/**
 * Un champ = libellé (15/20) + champ (44 px) + éventuel indice (13/20).
 * L'écart libellé/champ est de 6 px : demi-pas assumé, c'est l'écart optique
 * entre un mot et son objet, pas un pas de mise en page.
 *
 * `bg-background` : l'intérieur du champ est celui du PAPIER, pas celui de la
 * feuille sur laquelle il est posé — un champ est un creux dans la page. Avant,
 * fond de champ et fond de feuille étaient la même couleur (1,00:1) et seul un
 * filet à 1,5:1 disait qu'on pouvait écrire là.
 *
 * `hold` : le champ se dépose dans le registre de la page, qui sait alors y
 * ramener le focus (erreur, changement de porte).
 */
function Field({
  id,
  label,
  value,
  onChange,
  hint,
  invalid,
  hold,
  ...rest
}: {
  id: FieldId;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  invalid?: boolean;
  hold: React.RefObject<Partial<Record<FieldId, HTMLInputElement | null>>>;
} & Omit<React.ComponentProps<"input">, "onChange" | "value" | "id" | "ref">) {
  // Le champ fautif est DÉCRIT par la tuile d'erreur : un lecteur d'écran qui
  // arrive dessus entend le libellé, puis la cause et le remède.
  const described = [hint ? `${id}-hint` : null, invalid ? PROBLEM_ID : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={(el) => {
          hold.current[id] = el;
        }}
        /* `rounded-md` (12 px, le rayon de la tuile d'icône) au lieu du 20 px
           des boutons : LA PILULE AGIT, LA BOÎTE REÇOIT. Au repos, un champ
           vide de 44 px au rayon d'un bouton se lit comme un bouton fantôme —
           c'est la moitié du « pâles capsules vides » qu'on nous a reproché,
           l'autre moitié étant le bord invisible. Le rayon reste un rayon du
           système (`--radius-md`), aucune valeur inventée. */
        /* `focus-visible:bg-background` ANNULE le fond groseille pâle du focus.
           Motif mesuré à l'écran : au focus, le champ prenait `--primary-soft`
           (255 235 236) + un halo groseille (184 40 77) ; en erreur, il prend
           `--destructive-soft` (255 232 228) + un bord rouge (179 36 31). Trois
           unités de différence : deux ÉTATS DIFFÉRENTS avaient la même image.
           Le focus garde donc ses deux signaux forts (halo 2 px à 6,0:1, bord
           qui passe au groseille) et l'erreur reste la seule à teinter le
           REMPLISSAGE. Un état = une image. */
        className="rounded-md bg-background focus-visible:bg-background"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={described || undefined}
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-meta text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Une erreur NOMMÉE : la cause (le message du serveur, tel quel), le remède, et
 * une issue qui est déjà à l'écran — la seconde porte, ou le bouton lui-même
 * pour réessayer. Jamais une ligne rouge nue, jamais une exception, jamais un
 * cul-de-sac.
 *
 * Le rouge d'état est porté par la SURFACE, la MARGE et le pictogramme — pas par
 * les mots. Deux raisons : (a) en thème sombre, `--destructive` (244 124 110) et
 * `--primary` (238 125 141) sont à 17° l'un de l'autre, et un titre rouge à côté
 * d'un bouton rose faisait lire « erreur » et « action » de la même couleur ;
 * (b) le titre passe de 5,x:1 à l'encre du carnet, soit 12:1 et plus. Le trait
 * de 4 px est la marque de correction dans la marge, la seule chose qui
 * ressemble à un stylo rouge dans tout le produit.
 *
 * `tabIndex={-1}` : c'est la cible de focus quand aucun champ n'est en cause
 * (panne réseau) — le focus ne retombe jamais sur `<body>`.
 */
function ProblemNote({
  problem,
  ref,
}: {
  problem: Problem;
  ref: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      id={PROBLEM_ID}
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-3 rounded-r-xl rounded-l-sm border-l-4 border-l-destructive bg-destructive-soft p-4"
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        {/* `text-balance` : sans lui, « E-mail ou mot de passe incorrect. »
            coupait après « de ». */}
        <p className="text-ui font-bold text-balance text-foreground">
          {problem.cause}
        </p>
        <p className="text-meta text-foreground">{problem.remedy}</p>
      </div>
    </div>
  );
}

/**
 * Le lien est parti. C'est le sommet de l'écran pour un proche : on confirme
 * (vert = confirmé, le même vert que « journée publiée »), on dit quoi faire, on
 * donne l'unique conseil qui sert vraiment (les indésirables), et on laisse deux
 * issues — renvoyer, ou corriger l'adresse.
 *
 * DEUX LIENS PASSENT PAR ICI et ils ne font pas la même chose : celui de la
 * porte du lien CONNECTE, celui du mot de passe oublié MÈNE AU CHOIX d'un
 * nouveau mot de passe. La phrase le dit, parce que c'est la dernière fois
 * qu'on peut le dire avant la boîte de réception.
 *
 * Nuance qui n'en est pas une : le serveur répond « c'est parti » même pour une
 * adresse sans compte (sinon cet écran dirait qui est inscrit sur l'instance).
 * L'accusé de réception du mot de passe oublié est donc écrit au conditionnel.
 */
function LinkSent({
  kind,
  email,
  resent,
  busy,
  onResend,
  onChange,
}: {
  kind: "magic" | "forgot";
  email: string;
  resent: boolean;
  busy: boolean;
  onResend: () => void;
  onChange: () => void;
}) {
  return (
    <div role="status" className={SHEET}>
      <MargeRule />
      <SheetTitle icon={MailCheck} title="Le lien est parti" tone="done" />

      <p className="carnet-story text-foreground">
        {kind === "forgot"
          ? "Ouvrez-le depuis cet appareil : il vous mènera au choix d’un nouveau mot de passe. Passé une heure, il ne vaut plus rien."
          : "Ouvrez-le depuis cet appareil : il vous connecte au journal, sans mot de passe."}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-meta text-muted-foreground">
          Envoyé à <span className="font-bold text-foreground">{email}</span>
          {kind === "forgot" && ", si un compte y est ouvert"}
          {resent && " · renvoyé à l’instant"}
        </p>
        <p className="flex items-start gap-2 text-meta text-muted-foreground">
          <Inbox className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {"Rien reçu au bout d’une minute ? Regardez dans les courriers indésirables."}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full aria-disabled:cursor-progress aria-disabled:hover:bg-card"
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
          onClick={onResend}
        >
          {busy ? "Envoi…" : "Renvoyer le lien"}
        </Button>
        {busy && <WaitBar label="Envoi du lien…" />}
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={onChange}
        >
          <ArrowLeft aria-hidden="true" />
          {"Corriger l’adresse"}
        </Button>
      </div>
    </div>
  );
}
