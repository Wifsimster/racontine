import { useEffect, useMemo, useRef, useState } from "react";
import { DoorTitle } from "@/components/Door";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { mesure } from "@/lib/mesure";
import { Button } from "@/components/ui/button";
import { LoginBackground } from "@/components/LoginBackground";
import {
  FIELDS,
  NETWORK,
  flags,
  hasPassword,
  problemFor,
  type Door,
  type FieldId,
  type Problem,
} from "@/features/login/problems";
import {
  Field,
  LinkSent,
  ProblemNote,
  SHEET,
  SheetTitle,
  WaitBar,
} from "@/features/login/parts";
import { MarqueSignature } from "@/components/Marque";
import { StudioSignature } from "@/components/Studio";

export default function Login() {
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

  const [door, setDoor] = useState<Door>(() =>
    new URLSearchParams(location.search).get("porte") === "inscription"
      ? "signup"
      : "password",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentKind, setSentKind] = useState<"magic" | "forgot">("magic");
  const [resent, setResent] = useState(false);

  const [appName, setAppName] = useState("Racontine");
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fields = useRef<Partial<Record<FieldId, HTMLInputElement | null>>>({});
  const alertRef = useRef<HTMLDivElement | null>(null);
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
        else {
          if (door === "signup") mesure("inscription_creee");
          window.location.href = next;
        }
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
      className="relative isolate min-h-svh overflow-hidden pt-safe pb-safe [--input:rgb(140_142_152)] dark:[--input:rgb(110_112_120)]"
    >
      <LoginBackground wide />

      <main className="rise-enter mx-auto flex w-full max-w-[26rem] flex-col pt-[5.25rem] pr-5 pb-6 pl-10 lg:grid lg:max-w-[64rem] lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-16 lg:px-10 lg:pt-32 lg:pb-16 xl:gap-x-24">
        <div className="lg:col-start-1 lg:row-start-1 lg:pt-4">
          <DoorTitle appName={appName} />
          <p className="carnet-story mt-4 text-foreground lg:max-w-[22ch] lg:text-[1.375rem] lg:leading-9">
            {"Photographiez le carnet : la journée s’écrit, les proches la lisent."}
          </p>
        </div>

        <div className="flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-mt-7">
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
            <SheetTitle id="feuille-titre" title={heading} />

            {door === "magic" && (
              <p className="text-meta text-muted-foreground">
                {"Aucun mot de passe à retenir : nous vous envoyons un lien qui vous connecte au journal."}
              </p>
            )}

            {door === "forgot" && (
              <p className="text-meta text-muted-foreground">
                {"Nous vous envoyons un lien qui mène au choix d’un nouveau mot de passe. Il ne vaut qu’une heure."}
              </p>
            )}

            <div className="flex flex-col gap-4">
              {door === "signup" && (
                <Field
                  id="name"
                  label="Votre nom"
                  value={name}
                  onChange={setName}
                  hold={fields}
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

            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                size="lg"
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
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="text-meta text-muted-foreground">ou</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
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

        {!sentTo && door === "password" && (
          <div className="mt-2 flex min-h-11 items-center">
            {!settingsLoaded ? (
              <span className="skeleton h-4 w-52" aria-hidden="true" />
            ) : signupEnabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
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

        </div>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <p className="mt-4 flex items-start gap-2 text-meta text-muted-foreground lg:max-w-[34ch]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {"Instance privée : tout reste sur votre serveur."}
            </span>
          </p>

          <MarqueSignature className="mt-6" />
          <StudioSignature className="mt-1" />
        </div>
      </main>
    </div>
  );
}
