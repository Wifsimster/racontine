import { ArrowLeft, Inbox, MailCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldId, type Problem, PROBLEM_ID } from "./problems";
/* LES PIÈCES DE LA FEUILLE : la réglure, le titre, l'attente, un champ, la
   note d'erreur et l'accusé d'envoi du lien. */

export const SHEET =
  "relative mt-7 -ml-4 flex flex-col gap-5 rounded-r-2xl border border-l-0 bg-card p-5 pl-4 shadow-card";

/**
 * Le trait de marge, REDESSINÉ sur le bord de la feuille. Le trait du fond
 * (`LoginBackground`) est à `-z-10` : la feuille, opaque, le masque sur toute sa
 * hauteur. Le redessiner ici — même largeur, même jeton — rend l'axe continu du
 * haut de l'écran au bas, à travers la feuille.
 */
export function MargeRule() {
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
export function SheetTitle({
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
export function WaitBar({ label }: { label: string }) {
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
export function Field({
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
export function ProblemNote({
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
export function LinkSent({
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

