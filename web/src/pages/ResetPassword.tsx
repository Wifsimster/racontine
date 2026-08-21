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

/* ===========================================================================
   CHOISIR UN NOUVEAU MOT DE PASSE — la troisième porte.

   On arrive ici par le lien reçu dans l'e-mail « Réinitialiser votre mot de
   passe ». Ce lien ne mène pas directement à cette page : il passe d'abord par
   le serveur (`/api/auth/reset-password/<jeton>`), qui vérifie le jeton et
   redirige ici avec `?token=…` — ou avec `?error=INVALID_TOKEN` si le jeton a
   expiré, a déjà servi, ou n'a jamais existé. Cette page n'a donc que trois
   états, et ils sont dessinés tous les trois :

     1. LE FORMULAIRE. Un seul champ, pas deux. Une confirmation « retapez le
        mot de passe » ne vérifie que la constance d'une faute de frappe, et
        elle double le travail sur un clavier de téléphone ; le bouton
        « afficher » vérifie ce qui est VRAIMENT écrit, et il le vérifie avant
        l'envoi. Le champ est en `new-password` : les gestionnaires de mots de
        passe proposent d'en générer un, et surtout d'enregistrer le nouveau.
     2. LE LIEN NE VAUT PLUS. Ce n'est pas une erreur de l'utilisateur : c'est
        une heure qui est passée. On le dit sans faute à personne, et on donne
        la sortie — redemander un lien depuis la connexion.
     3. C'EST FAIT. Toutes les sessions ont été coupées côté serveur
        (`revokeSessionsOnPasswordReset`) : on ne fait donc pas semblant
        d'ouvrir le journal, on renvoie à la connexion, avec le mot de passe
        tout neuf. Le nommer explicitement évite le doute de l'écran suivant.

   La porte hérite du carnet (`Door.tsx`) : même réglure, même colonne de
   26 rem, même feuille posée sur le trait de marge que la connexion et
   l'invitation. Aucun objet nouveau n'est inventé ici.
   =========================================================================== */

/** Le minimum imposé par Better Auth (`minPasswordLength`), annoncé AVANT la saisie. */
const MIN_LENGTH = 8;

/**
 * Le serveur ne parle pas français, et ses deux refus ne se soignent pas de la
 * même façon : un jeton mort change d'écran (le formulaire ne sert plus à
 * rien), un mot de passe trop court se corrige sur place.
 */
function isDeadToken(message: string): boolean {
  return /invalid.?token|expired|jeton/i.test(message);
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  /* Le serveur redirige ici avec `?error=INVALID_TOKEN` quand il a refusé le
     jeton. Sans jeton du tout, on est arrivé par un lien tronqué (les clients
     de messagerie coupent parfois une URL longue) : même écran, même sortie. */
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
    /* Le minimum est vérifié ICI aussi, et pas seulement par le serveur : un
       aller-retour réseau pour apprendre qu'il manque deux caractères, c'est
       une seconde perdue et un message en anglais. Le formulaire est
       `noValidate` : c'est NOTRE phrase qui s'affiche, pas une bulle native. */
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

  /* LE BANDEAU NE CONTREDIT JAMAIS LA FEUILLE. « Choisissez un nouveau mot de
     passe » écrit au-dessus de « ce lien ne vaut plus », c'est une page qui se
     dément en deux lignes ; quand il n'y a plus rien à choisir, le haut de page
     redevient celui du produit — la même phrase que la porte d'invitation. */
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

  /* 3 — C'est fait. */
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

  /* 2 — Le lien ne vaut plus : ce n'est la faute de personne, et il y a une sortie. */
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

  /* 1 — Le formulaire. */
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
          {/* Le champ et le bouton « afficher » sont UN objet : le bouton est
              posé dans le champ, à droite, sur 44 px de cible. `pr-14` réserve
              sa place pour que le texte saisi ne passe jamais dessous. */}
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
              /* `aria-pressed` plutôt qu'un libellé qui change de sens : le
                 bouton dit toujours ce qu'il FAIT, son état dit où l'on en est. */
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
