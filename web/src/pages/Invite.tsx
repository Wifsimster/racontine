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

const INTENT_PREFIX = "racontine.invitation.";

function rememberIntent(token: string) {
  try {
    localStorage.setItem(INTENT_PREFIX + token, "1");
  } catch {
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
  }
}

function sameEmail(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isMissingLink(message: string): boolean {
  return /introuvable|not found|404/i.test(message);
}

type Phase =
  | "loading"
  | "ready"
  | "sent"
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
  const autoTried = useRef(false);

  const email = preview?.email ?? "";
  const mine = session?.user.email;
  const canJoin = !!session && session.user.emailVerified;
  const wrongAccount = !!session && !!email && !sameEmail(mine, email);

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

  useEffect(() => {
    if (autoTried.current) return;
    if (phase !== "ready" || sessionPending) return;
    if (!preview || loadError) return;
    if (preview.status !== "pending" || preview.expired) return;
    if (!canJoin || !sameEmail(mine, email)) return;
    if (!hadIntent(token)) return;
    autoTried.current = true;
    void accept();
  }, [
    accept,
    canJoin,
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

  async function switchAccount() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch {
    }
    setBusy(false);
    await sendMagicLink(email);
  }

  const open = !!preview && preview.status === "pending" && !preview.expired;
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

  if (phase === "loading" || (sessionPending && !preview)) {
    return frame(<InviteSkeleton />);
  }

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
        <div
          aria-hidden="true"
          className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/2 rounded-full bg-success" />
        </div>
      </DoorSheet>,
    );
  }

  return frame(
    <DoorSheet>
      <DoorSheetTitle
        icon={session ? UserCheck : Mail}
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
        onClick={() => (canJoin ? accept() : sendMagicLink(email))}
      >
        {canJoin ? (
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

function InviteSkeleton() {
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
