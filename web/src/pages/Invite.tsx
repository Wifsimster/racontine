import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  BookOpenText,
  CloudOff,
  Inbox,
  Mail,
  MailCheck,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  UserX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { ROLE_LABELS, ROLE_HINTS, type InvitationPreview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DoorPage,
  DoorHeading,
  DoorSheet,
  DoorSheetTitle,
} from "@/components/Door";

/* ===========================================================================
   RECEVOIR UNE INVITATION — la porte des proches.

   C'est le premier écran que voit la moitié des utilisateurs de Racontine : la
   mamie qui reçoit un lien. Il était le moins soigné de l'app et, surtout, le
   plus coûteux : DEUX taps et QUATRE écrans pour arriver au journal, avec deux
   pièges au milieu et trois culs-de-sac sans une seule sortie cliquable.

   Cinq décisions, toutes prises en mesurant le parcours (voir gauntlet/flow.md) :

   · LE CHAMP E-MAIL DISPARAÎT. Une invitation est NOMINATIVE : le serveur
     refuse l'acceptation si l'adresse du compte ne correspond pas
     (`sharing.ts`, 403). Offrir un champ modifiable pré-rempli, c'est offrir un
     piège : en saisir une autre envoie bien un lien magique, crée bien un
     compte… qui ne pourra JAMAIS accepter l'invitation. L'adresse est donc
     affichée, pas ressaisie — et l'app connaît déjà la réponse, donc il ne
     reste qu'un bouton.
   · LE RETOUR DU LIEN MAGIQUE ACCEPTE TOUT SEUL. Le proche a déjà lu de qui et
     de quoi il s'agit, et il a déjà tapé « Recevoir mon lien ». Lui demander de
     retaper « Rejoindre le cercle » à son retour, c'est faire payer un tap pour
     une décision déjà prise. L'intention est mémorisée (`localStorage`) avant
     l'envoi du lien, et honorée au retour. Un arrivant qui n'est PAS passé par
     notre boucle e-mail (déjà connecté, lien transféré) garde son bouton : il
     n'a rien vu, il doit voir avant de rejoindre.
   · LA MAUVAISE ADRESSE EST DITE AVANT LE TAP. Le refus 403 arrivait APRÈS le
     clic, en une ligne rouge, et le seul bouton de l'écran était celui qui
     venait d'échouer. Maintenant l'écart d'adresse est détecté à l'affichage,
     nommé, et il porte sa vraie sortie : se connecter avec l'adresse invitée.
   · PLUS UN SEUL CUL-DE-SAC. Expirée, révoquée, déjà acceptée, introuvable,
     réseau coupé : cinq états, cinq écrans dessinés, et chacun avec au moins
     une sortie. « Déjà acceptée » va même plus loin — on connaît l'adresse,
     donc on propose le lien de connexion au lieu de renvoyer vers un
     formulaire à remplir.
   · L'ARRIVÉE EST ANNONCÉE. Accepter menait à `/` sans un mot : le proche
     atterrissait sur une liste de journées sans savoir qu'il avait rejoint quoi
     que ce soit. Le journal l'accueille désormais (voir `Timeline.tsx`).
   =========================================================================== */

/**
 * Mémoire de l'intention, posée AVANT le départ du lien magique et relue au
 * retour. `localStorage` et non `sessionStorage` : le lien s'ouvre depuis une
 * appli de messagerie, donc souvent dans un nouvel onglet — une session de
 * stockage ne survivrait pas. Si le lien s'ouvre dans un AUTRE navigateur, la
 * clé est absente : on retombe simplement sur le bouton. C'est une
 * amélioration progressive, jamais un prérequis.
 */
const INTENT_PREFIX = "racontine.invitation.";

function rememberIntent(token: string) {
  try {
    localStorage.setItem(INTENT_PREFIX + token, "1");
  } catch {
    /* stockage refusé (navigation privée stricte) : on perdra juste le tap */
  }
}

function hadIntent(token: string): boolean {
  try {
    return localStorage.getItem(INTENT_PREFIX + token) === "1";
  } catch {
    return false;
  }
}

function forgetIntent(token: string) {
  try {
    localStorage.removeItem(INTENT_PREFIX + token);
  } catch {
    /* rien à oublier */
  }
}

/** Deux adresses e-mail sont la même adresse à la casse et aux espaces près. */
function sameEmail(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * `api.ts` ne remonte pas le code HTTP, seulement la phrase du serveur. Un lien
 * qui n'existe pas dit « invitation introuvable » (404) ; tout le reste est une
 * panne d'accès, qui se réessaie. La distinction compte : l'un est définitif et
 * mérite une explication, l'autre est temporaire et mérite un bouton.
 */
function isMissingLink(message: string): boolean {
  return /introuvable|not found|404/i.test(message);
}

/* -------------------------------------------------------------------------- */

type Phase =
  /** Aperçu en cours de chargement. */
  | "loading"
  /** Aperçu reçu : on montre l'invitation. */
  | "ready"
  /** Lien magique parti, en attente de l'e-mail. */
  | "sent"
  /** Acceptation en cours (tap explicite ou retour du lien magique). */
  | "joining";

export default function Invite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();

  const [appName, setAppName] = useState("Racontine");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  /** L'acceptation automatique ne se tente qu'UNE fois par montage. */
  const autoTried = useRef(false);

  const email = preview?.email ?? "";
  const mine = session?.user.email;
  const wrongAccount = !!session && !!email && !sameEmail(mine, email);

  /* Le nom de l'instance : le proche doit lire le nom du carnet auquel on
     l'invite, pas un nom de produit. La route est publique. */
  useEffect(() => {
    let alive = true;
    api
      .publicSettings()
      .then((s) => {
        if (alive) setAppName(s.appName);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* ── UNE ATTENTE QUI FINIT TOUJOURS PAR RENDRE LA MAIN ────────────────────
     Mesuré sur un GET /api/invitations/token/:t qui ne revient jamais : à 3 s le
     squelette nomme correctement la cause probable, mais à 15 s l'écran est
     OCTET POUR OCTET le même et il ne contient AUCUN élément cliquable — zéro
     sortie, pour toujours. Le proche invité, lui, est quelqu'un qui vient
     d'ouvrir un lien reçu par mail : c'est la première image du produit.
     `fetch` n'a pas de délai d'attente ; on en pose un. Au bout de 10 secondes,
     l'attente devient l'ERREUR QUI EXISTE DÉJÀ pour cet écran — « L'invitation
     ne vient pas », sa cause, « Réessayer », « Ouvrir Racontine », et le détail
     technique replié. Rien de nouveau à dessiner : il manquait seulement le
     chemin qui y mène. 10 s et non 30 : au-delà, on n'attend plus, on est
     bloqué. */
  useEffect(() => {
    let alive = true;
    let settled = false;
    setPhase((p) => (p === "loading" ? p : "loading"));
    const timeout = setTimeout(() => {
      if (!alive || settled) return;
      setLoadError(
        "Délai dépassé : le carnet n’a pas répondu en 10 secondes (GET /api/invitations/token).",
      );
      setPhase("ready");
    }, 10000);
    api
      .getInvitation(token)
      .then((p) => {
        if (!alive) return;
        settled = true;
        clearTimeout(timeout);
        setPreview(p);
        setLoadError(null);
        setPhase("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        settled = true;
        clearTimeout(timeout);
        setLoadError(e instanceof Error ? e.message : "Échec du chargement");
        setPhase("ready");
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [token, reloadKey]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const accept = useCallback(async () => {
    if (!preview) return;
    setPhase("joining");
    setError(null);
    try {
      await api.acceptInvitation(token);
      forgetIntent(token);
      // Le journal accueille : il sait qui vient d'arriver, et pour qui.
      navigate("/", {
        replace: true,
        state: {
          joined: { childName: preview.childName, role: preview.role },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'adhésion");
      setPhase("ready");
    }
  }, [navigate, preview, token]);

  /* LE TAP QU'ON REND : au retour du lien magique, l'intention est déjà donnée.
     Conditions strictes — invitation ouvrable, session en place, adresse
     identique, intention mémorisée avant l'envoi. Sinon, le bouton reste. */
  useEffect(() => {
    if (autoTried.current) return;
    if (phase !== "ready" || sessionPending) return;
    if (!preview || loadError) return;
    if (preview.status !== "pending" || preview.expired) return;
    if (!session || !sameEmail(mine, email)) return;
    if (!hadIntent(token)) return;
    autoTried.current = true;
    void accept();
  }, [
    accept,
    email,
    loadError,
    mine,
    phase,
    preview,
    session,
    sessionPending,
    token,
  ]);

  async function sendMagicLink(target: string, again = false) {
    setBusy(true);
    setError(null);
    if (again) setResent(false);
    // On mémorise AVANT l'envoi : si l'e-mail arrive plus vite que le retour
    // réseau, l'intention est déjà là.
    rememberIntent(token);
    try {
      const res = await signIn.magicLink({
        email: target,
        callbackURL: `/invite/${token}`,
      });
      if (res.error) {
        setError(res.error.message ?? "L'envoi du lien a échoué.");
      } else {
        setPhase("sent");
        if (again) setResent(true);
      }
    } catch {
      setError("Connexion interrompue. Vérifiez votre réseau et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  /** Mauvais compte : on sort de celui-ci et on envoie le lien au bon. */
  async function switchAccount() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch {
      /* la déconnexion locale suffit à débloquer le parcours */
    }
    setBusy(false);
    await sendMagicLink(email);
  }

  /* ----------------------------- les états ------------------------------- */

  /* LA PHRASE-PROMESSE **EST** L'INVITATION.
     Premier jet : le bandeau générique de la connexion (« Les journées d'un
     enfant, écrites à partir du carnet de liaison… »), puis un bloc de lede qui
     répétait le prénom de l'enfant en 30/36 sous le nom de l'instance — deux
     crans display collés, et la question « qui est le sujet de cet écran ? »
     laissée sans réponse. La phrase posée sur les lignes du cahier dit
     maintenant la seule chose qui compte à un proche qui arrive : DE QUI il
     s'agit, et QUE lui propose-t-on. Le produit s'explique dans le même
     souffle. Un bloc de moins, un cran display de moins, et la première ligne
     lue est la bonne. */
  /* …mais SEULEMENT quand l'invitation est encore ouvrable : écrire « Vous êtes
     invité·e à suivre Louise » au-dessus de « cette invitation a expiré » ferait
     une page qui se contredit en deux lignes. */
  const open = !!preview && preview.status === "pending" && !preview.expired;
  /* TOUT LE HAUT DE PAGE EN 17/28, un seul objet typographique. Le rôle vivait
     dans un `p` à 15/20 juste en dessous : posé sur une réglure de 28 px, un
     interligne de 20 dérive d'un demi-pas à chaque ligne et le texte cesse
     d'être écrit SUR le papier. Il rejoint donc la phrase, où il est de toute
     façon à sa place — c'est du contenu (« ce qu'on vous propose »), pas une
     légende. */
  /* Et pas quand on la lit depuis un AUTRE compte : « vous êtes invité·e à
     suivre Louise » est faux pour la personne connectée, l'invitation n'est pas
     la sienne. La feuille explique alors la situation ; le bandeau reste neutre. */
  const lede = open && !wrongAccount ? (
    <>
      Vous êtes invité·e à suivre{" "}
      <span className="font-bold">{preview!.childName}</span> : ses journées,
      écrites à partir du carnet de liaison. Vous y serez{" "}
      <span className="font-bold">{ROLE_LABELS[preview!.role]}</span> —{" "}
      {ROLE_HINTS[preview!.role].toLowerCase()}.
    </>
  ) : (
    "Les journées d’un enfant, écrites à partir du carnet de liaison, à lire en famille."
  );

  const frame = (children: React.ReactNode) => (
    <DoorPage>
      <DoorHeading appName={appName}>{lede}</DoorHeading>
      {offline && (
        <p className="mt-5 flex items-start gap-3 rounded-xl bg-warning-bg px-4 py-3 text-meta text-warning">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">Hors ligne.</span> L’invitation vous
            attend : elle s’ouvrira dès le retour du réseau.
          </span>
        </p>
      )}
      {children}
    </DoorPage>
  );

  /* 1 — Le chargement montre la FORME de l'invitation, pas « Chargement… ». */
  if (phase === "loading" || (sessionPending && !preview)) {
    return frame(<InviteSkeleton />);
  }

  /* 2 — Le lien n'existe pas, ou l'aperçu n'a pas pu être lu. */
  if (loadError) {
    const missing = isMissingLink(loadError);
    return frame(
      <DoorSheet>
        <DoorSheetTitle
          icon={missing ? UserX : TriangleAlert}
          tone="warn"
          title={missing ? "Ce lien ne s’ouvre plus" : "L’invitation ne vient pas"}
        />
        <p className="carnet-story text-foreground">
          {missing
            ? "Le lien a peut-être été révoqué, ou remplacé par un plus récent. Demandez une nouvelle invitation à la personne qui tient le carnet."
            : "Ce n’est pas l’invitation qui est perdue, c’est la connexion au carnet qui a échoué."}
        </p>
        <div className="flex flex-col gap-2">
          {!missing && (
            <Button
              size="lg"
              loading={busy}
              onClick={() => {
                setLoadError(null);
                setPhase("loading");
                setReloadKey((k) => k + 1);
              }}
            >
              <RotateCcw aria-hidden="true" />
              Réessayer
            </Button>
          )}
          <Button asChild variant={missing ? "default" : "outline"}>
            <Link to={session ? "/" : "/login"}>
              <BookOpenText aria-hidden="true" />
              {session ? "Ouvrir le journal" : `Ouvrir ${appName}`}
            </Link>
          </Button>
        </div>
        <TechnicalDetail message={loadError} />
      </DoorSheet>,
    );
  }

  if (!preview) return frame(<InviteSkeleton />);

  /* 3 — Le lien magique est parti : ce qui se passe ensuite, en clair. */
  if (phase === "sent") {
    return frame(
      <DoorSheet role="status">
        <DoorSheetTitle icon={MailCheck} tone="done" title="Le lien est parti" />
        <p className="carnet-story text-foreground">
          {
            "Ouvrez-le depuis cet appareil : il vous connecte et vous fait rejoindre le carnet, d’un seul geste."
          }
        </p>
        <div className="flex flex-col gap-2">
          <p className="text-meta text-muted-foreground">
            Envoyé à <span className="font-bold text-foreground">{email}</span>
            {resent && " · renvoyé à l’instant"}
          </p>
          <p className="flex items-start gap-2 text-meta text-muted-foreground">
            <Inbox className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {
                "Rien reçu au bout d’une minute ? Regardez dans les courriers indésirables."
              }
            </span>
          </p>
        </div>
        {error && <Problem message={error} />}
        <Button
          variant="outline"
          className="w-full"
          loading={busy}
          onClick={() => sendMagicLink(email, true)}
        >
          <Mail aria-hidden="true" />
          Renvoyer le lien
        </Button>
      </DoorSheet>,
    );
  }

  /* 4 — L'invitation a déjà servi. On connaît l'adresse : on ouvre la porte. */
  if (preview.status === "accepted") {
    return frame(
      <DoorSheet>
        <DoorSheetTitle
          icon={UserCheck}
          tone="done"
          title="Vous faites déjà partie du cercle"
        />
        <p className="carnet-story text-foreground">
          Cette invitation a déjà servi — c’est normal, elle ne sert qu’une fois.
          Le journal de {preview.childName} vous est ouvert.
        </p>
        {error && <Problem message={error} />}
        <div className="flex flex-col gap-2">
          {session ? (
            <Button asChild size="lg">
              <Link to="/">
                <BookOpenText aria-hidden="true" />
                Ouvrir le journal
              </Link>
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                loading={busy}
                onClick={() => sendMagicLink(email)}
              >
                <Mail aria-hidden="true" />
                Recevoir mon lien de connexion
              </Button>
              <p className="text-meta text-muted-foreground">
                Il partira à{" "}
                <span className="font-bold text-foreground">{email}</span>. Pas
                de mot de passe à retenir.
              </p>
            </>
          )}
        </div>
      </DoorSheet>,
    );
  }

  /* 5 — Révoquée ou expirée : deux causes distinctes, une même sortie. */
  if (preview.status === "revoked" || preview.expired) {
    const revoked = preview.status === "revoked";
    return frame(
      <DoorSheet>
        <DoorSheetTitle
          icon={UserX}
          tone="warn"
          title={revoked ? "Cette invitation a été retirée" : "Cette invitation a expiré"}
        />
        <p className="carnet-story text-foreground">
          {revoked
            ? `La personne qui tient le carnet de ${preview.childName} a retiré cette invitation. Rien de grave : elle peut vous en envoyer une nouvelle.`
            : `Les liens d’invitation ne restent valables que quelques jours, par sécurité. Demandez-en un nouveau pour rejoindre le carnet de ${preview.childName}.`}
        </p>
        <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Un lien qui ne sert plus est un lien qui ne peut plus être transféré
            à quelqu’un d’autre : c’est ce qui protège le journal.
          </span>
        </p>
        <Button asChild size="lg">
          <Link to={session ? "/" : "/login"}>
            <BookOpenText aria-hidden="true" />
            {session ? "Ouvrir le journal" : `Ouvrir ${appName}`}
          </Link>
        </Button>
      </DoorSheet>,
    );
  }

  /* 6 — Connecté avec une AUTRE adresse : dit avant le tap, avec sa sortie. */
  if (wrongAccount) {
    return frame(
      <DoorSheet>
        <DoorSheetTitle
          icon={UserX}
          tone="warn"
          title="Ce n’est pas le bon compte"
        />
        <p className="carnet-story text-foreground">
          L’invitation est nominative : elle a été envoyée à{" "}
          <span className="font-bold">{email}</span>, et vous êtes connecté·e en
          tant que <span className="font-bold">{mine}</span>.
        </p>
        {error && <Problem message={error} />}
        <div className="flex flex-col gap-2">
          {/* L'ADRESSE NE VA PAS DANS LE LIBELLÉ. Essayé : « Recevoir un lien
              pour colette@orange.fr » ne tient pas sur une ligne à 390 px et se
              coupait au milieu du domaine (« colette / @orange.fr ») — un bouton
              de deux lignes dont l'icône flotte au milieu. Les deux adresses
              sont déjà écrites au-dessus, et la ligne de conséquence les redit
              dans l'ordre où elles vont servir. */}
          <Button size="lg" loading={busy} onClick={switchAccount}>
            <Mail aria-hidden="true" />
            Recevoir un lien de connexion
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Rester sur mon compte</Link>
          </Button>
        </div>
        <p className="text-meta text-muted-foreground">
          Vous serez déconnecté·e de{" "}
          <span className="font-bold break-all text-foreground">{mine}</span>,
          puis connecté·e à{" "}
          <span className="font-bold break-all text-foreground">{email}</span>.
        </p>
      </DoorSheet>,
    );
  }

  /* 7 — L'acceptation en cours : elle DIT ce qu'elle fait. */
  if (phase === "joining") {
    return frame(
      <DoorSheet role="status">
        <DoorSheetTitle
          icon={UserCheck}
          tone="done"
          title="On vous ouvre le carnet"
        />
        <p className="carnet-story text-foreground">
          Votre place dans le cercle de {preview.childName} se crée, puis le
          journal s’ouvre. Ce n’est qu’une seconde.
        </p>
        {/* Deux temps déclarés, comme la barre d'envoi de la capture : la part
            acquise (vert), la part en vol (le gris des bords de champ). Aucun
            pourcentage inventé, aucune roue de 1 000 ms. */}
        <div
          aria-hidden="true"
          className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/2 rounded-full bg-success" />
        </div>
      </DoorSheet>,
    );
  }

  /* 8 — L'invitation, prête à être acceptée. */
  return frame(
    <DoorSheet>
      <DoorSheetTitle
        icon={session ? UserCheck : Mail}
        /* Court, et surtout PAS le libellé du bouton : le titre de feuille
           répétait mot pour mot « Recevoir mon lien de connexion » deux crans
           plus haut, sur deux lignes, pour ne rien dire de plus. */
        title="Rejoindre le carnet"
      />
      {session ? (
        <p className="carnet-story text-foreground">
          Vous êtes connecté·e en tant que{" "}
          <span className="font-bold">{mine}</span> : il ne reste qu’à rejoindre.
        </p>
      ) : (
        <>
          <p className="carnet-story text-foreground">
            {
              "Aucun mot de passe à créer : un lien vous connecte et vous fait rejoindre le carnet d’un seul geste."
            }
          </p>
          {/* L'ADRESSE EST AFFICHÉE, PAS RESSAISIE. Voir la note en tête de
              fichier : l'invitation est nominative, un champ modifiable ne
              pourrait mener qu'à un refus. */}
          <p className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3 text-ui">
            <Mail
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="surtitre block text-muted-foreground">
                Envoyé à
              </span>
              <span className="block font-bold break-all">{email}</span>
            </span>
          </p>
        </>
      )}

      {error && <Problem message={error} />}

      <Button
        size="lg"
        loading={busy}
        disabled={offline}
        onClick={() => (session ? accept() : sendMagicLink(email))}
      >
        {session ? (
          <>
            <UserCheck aria-hidden="true" />
            Rejoindre le cercle
          </>
        ) : (
          <>
            <Mail aria-hidden="true" />
            Recevoir mon lien de connexion
          </>
        )}
      </Button>

      <p className="flex items-start gap-2 text-meta text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {
            "Ce lien n’est valable que pour votre adresse, et il ne sert qu’une fois."
          }
        </span>
      </p>
    </DoorSheet>,
  );
}

/* -------------------------------------------------------------------------- */

/** Un refus du serveur, en français, avec sa tuile — jamais une ligne rouge nue. */
function Problem({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-meta text-destructive"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{message.replace(/'/g, "’")}</span>
    </p>
  );
}

/** Le détail brut, replié : de quoi ouvrir un journal serveur au bon endroit. */
function TechnicalDetail({ message }: { message: string }) {
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-meta text-muted-foreground transition-colors dur-fast ease-carnet hover:text-foreground [&::-webkit-details-marker]:hidden">
        Détail technique
      </summary>
      <p className="rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground">
        GET /api/invitations/token/… · {message}
      </p>
    </details>
  );
}

/**
 * Le chargement montre la forme de l'invitation : le prénom à venir, le rôle,
 * puis la feuille et son bouton. L'écran ne saute pas quand l'aperçu arrive.
 */
function InviteSkeleton() {
  /* Trois paliers, et le troisième est une PROMESSE TENUE : le composant parent
     transforme l'attente en erreur (avec « Réessayer ») à 10 s, donc on peut
     l'annoncer à 7 s au lieu de répéter la même phrase indéfiniment. */
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 3000);
    const b = setTimeout(() => setStep(2), 7000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <>
      <p
        role="status"
        className="mt-7 flex items-start gap-2 text-meta text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="skeleton mt-1.5 size-2 shrink-0 rounded-full"
        />
        <span>
          {step === 0
            ? "On ouvre l’invitation…"
            : step === 1
              ? "L’invitation met du temps à venir — la connexion est peut-être lente."
              : "Toujours rien. On vous rend la main dans quelques secondes."}
        </span>
      </p>
      <div aria-hidden="true" className="mt-4 flex flex-col gap-3">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-8 w-44" />
        <div className="skeleton h-4 w-56" />
      </div>
      <DoorSheet className="!mt-6">
        <div aria-hidden="true" className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="skeleton size-9" />
            <div className="skeleton h-5 w-48" />
          </div>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-4/5" />
          <div className="skeleton h-12 w-full rounded-xl" />
        </div>
      </DoorSheet>
    </>
  );
}
