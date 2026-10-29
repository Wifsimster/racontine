import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CircleCheck,
  KeyRound,
  RotateCcwKey,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DoorPage,
  DoorHeading,
  DoorSheet,
  DoorSheetTitle,
} from "@/components/Door";

const MIN_LENGTH = 8;

function isDeadToken(message: string): boolean {
  return /invalid.?token|expired|jeton/i.test(message);
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const dead = !token || !!params.get("error");

  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  const [appName, setAppName] = useState("Racontine");
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .publicSettings()
      .then((s) => alive && setAppName(s.appName))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_LENGTH) {
      setError(
        `Le mot de passe doit faire ${MIN_LENGTH} caractères au moins.`,
      );
      field.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (res.error) {
        const message = res.error.message ?? "La réinitialisation a échoué.";
        if (isDeadToken(message)) setExpired(true);
        else {
          setError(message);
          field.current?.focus();
        }
        return;
      }
      setDone(true);
    } catch {
      setError(
        "Impossible de joindre votre instance Racontine. Vérifiez votre connexion : rien n’a été changé.",
      );
    } finally {
      setBusy(false);
    }
  }

  const lede = done
    ? "Votre mot de passe est changé : le carnet vous attend."
    : dead || expired
      ? "Les journées d’un enfant, écrites à partir du carnet de liaison, à lire en famille."
      : "Choisissez un nouveau mot de passe : il ouvrira le carnet dès la prochaine connexion.";

  const frame = (children: React.ReactNode) => (
    <DoorPage>
      <DoorHeading appName={appName}>{lede}</DoorHeading>
      {children}
    </DoorPage>
  );

  if (done) {
    return frame(
      <DoorSheet role="status">
        <DoorSheetTitle
          icon={CircleCheck}
          tone="done"
          title="Votre mot de passe est enregistré"
        />
        <p className="carnet-story text-foreground">
          {
            "Les sessions ouvertes ailleurs ont été fermées, par sécurité : connectez-vous avec le nouveau mot de passe."
          }
        </p>
        <Button asChild size="lg">
          <Link to="/login">
            <KeyRound aria-hidden="true" />
            Se connecter
          </Link>
        </Button>
      </DoorSheet>,
    );
  }

  if (dead || expired) {
    return frame(
      <DoorSheet>
        <DoorSheetTitle
          icon={TriangleAlert}
          tone="warn"
          title="Ce lien ne vaut plus"
        />
        <p className="carnet-story text-foreground">
          {
            "Un lien de réinitialisation ne vit qu’une heure, et il ne sert qu’une fois. Celui-ci a expiré, ou il a déjà servi — rien n’est perdu : redemandez-en un, il part tout de suite."
          }
        </p>
        <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {
              "C’est cette durée courte qui protège le carnet : un lien oublié dans une boîte aux lettres n’ouvre plus rien."
            }
          </span>
        </p>
        <Button asChild size="lg">
          <Link to="/login">
            <RotateCcwKey aria-hidden="true" />
            Demander un nouveau lien
          </Link>
        </Button>
      </DoorSheet>,
    );
  }

  return frame(
    <DoorSheet>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5"
        aria-labelledby="feuille-titre"
        noValidate
      >
        <DoorSheetTitle
          icon={RotateCcwKey}
          title="Nouveau mot de passe"
          id="feuille-titre"
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">Votre nouveau mot de passe</Label>
          <div className="relative">
            <Input
              id="new-password"
              ref={field}
              type={shown ? "text" : "password"}
              className="rounded-md bg-background pr-14 focus-visible:bg-background"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              enterKeyHint="go"
              required
              aria-invalid={!!error || undefined}
              aria-describedby={
                error ? "reset-probleme new-password-hint" : "new-password-hint"
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute inset-y-0 right-0 my-auto px-3 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-pressed={shown}
              onClick={() => {
                setShown((v) => !v);
                field.current?.focus();
              }}
            >
              {shown ? "Cacher" : "Afficher"}
            </Button>
          </div>
          <p id="new-password-hint" className="text-meta text-muted-foreground">
            {MIN_LENGTH} caractères au minimum.
          </p>
        </div>

        {error && (
          <p
            id="reset-probleme"
            role="alert"
            className="flex items-start gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-meta text-destructive"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0">{error}</span>
          </p>
        )}

        <Button type="submit" size="lg" loading={busy}>
          {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </Button>

        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">Revenir à la connexion</Link>
        </Button>
      </form>
    </DoorSheet>,
  );
}
