import { useEffect, useState } from "react";
import { BookOpenText } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginBackground } from "@/components/LoginBackground";

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appName, setAppName] = useState("Racontine");
  const [signupEnabled, setSignupEnabled] = useState(true);

  // Nom de l'instance + inscriptions ouvertes ou non (réglages publics).
  useEffect(() => {
    api
      .publicSettings()
      .then((s) => {
        setAppName(s.appName);
        setSignupEnabled(s.signupEnabled);
        if (!s.signupEnabled) setMode("signin");
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === "signin"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name });
      if (res.error) {
        setError(res.error.message ?? "Échec de l'authentification");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-svh flex flex-col items-center justify-center gap-6 p-6 overflow-hidden">
      <LoginBackground />

      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <BookOpenText className="size-9 text-primary" />
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            {appName}
          </h1>
        </div>
        <p className="text-muted-foreground">
          Racontez vos histoires du quotidien et gardez-les pour toujours.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <h2 className="font-serif text-xl font-semibold">
          {mode === "signin" ? "Connexion" : "Créer un compte"}
        </h2>

        {mode === "signup" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={loading} className="mt-2">
          {loading
            ? "…"
            : mode === "signin"
              ? "Se connecter"
              : "Commencer gratuitement"}
        </Button>

        {signupEnabled ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
          >
            {mode === "signin"
              ? "Pas encore de compte ? Créer"
              : "Déjà un compte ? Se connecter"}
          </button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Les inscriptions sont fermées. Les proches invités reçoivent un lien
            de connexion par e-mail.
          </p>
        )}
      </form>
    </div>
  );
}
