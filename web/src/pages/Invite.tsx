import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { BookOpenText, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSession, signIn } from "@/lib/auth-client";
import { ROLE_LABELS, ROLE_HINTS, type InvitationPreview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Invite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getInvitation(token)
      .then((p) => {
        setPreview(p);
        setEmail(p.email);
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvitation(token);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
      setBusy(false);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn.magicLink({
      email,
      callbackURL: `/invite/${token}`,
    });
    setBusy(false);
    if (res.error) setError(res.error.message ?? "Échec de l'envoi");
    else setSent(true);
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <BookOpenText className="size-9 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight">Racontine</h1>
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        {children}
      </div>
    </div>
  );

  if (loadError)
    return shell(
      <div className="flex flex-col gap-3 text-center">
        <p className="font-medium">Invitation introuvable</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link to="/" className="text-sm text-primary hover:underline">
          Retour à l'accueil
        </Link>
      </div>,
    );

  if (!preview || isPending)
    return shell(
      <p className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Chargement…
      </p>,
    );

  if (preview.status === "revoked")
    return shell(
      <p className="py-4 text-center text-muted-foreground">
        Cette invitation a été révoquée.
      </p>,
    );
  if (preview.status === "accepted")
    return shell(
      <div className="flex flex-col gap-3 text-center">
        <p className="text-muted-foreground">Cette invitation a déjà été acceptée.</p>
        <Link to="/" className="text-sm text-primary hover:underline">
          Ouvrir le journal
        </Link>
      </div>,
    );
  if (preview.expired)
    return shell(
      <p className="py-4 text-center text-muted-foreground">
        Cette invitation a expiré. Demandez-en une nouvelle.
      </p>,
    );

  const invitationLede = (
    <div className="flex flex-col gap-1 text-center">
      <p className="text-sm text-muted-foreground">Vous êtes invité·e à suivre</p>
      <p className="text-xl font-semibold">{preview.childName}</p>
      <p className="text-sm text-muted-foreground">
        en tant que <span className="font-medium">{ROLE_LABELS[preview.role]}</span>{" "}
        — {ROLE_HINTS[preview.role].toLowerCase()}.
      </p>
    </div>
  );

  // Connecté : bouton d'acceptation.
  if (session)
    return shell(
      <div className="flex flex-col gap-5">
        {invitationLede}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={accept} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check />}
          Rejoindre le cercle
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Connecté·e en tant que {session.user.email}
        </p>
      </div>,
    );

  // Non connecté : magic link.
  return shell(
    <div className="flex flex-col gap-5">
      {invitationLede}
      {sent ? (
        <div className="flex flex-col gap-2 text-center">
          <Check className="mx-auto size-6 text-primary" />
          <p className="text-sm">
            Un lien de connexion a été envoyé à <strong>{email}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Ouvrez-le sur cet appareil pour rejoindre le cercle.
          </p>
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Votre email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Recevoir mon lien de connexion
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Pas besoin de mot de passe : un lien magique vous connecte.
          </p>
        </form>
      )}
    </div>,
  );
}
