import { cn } from "@/lib/utils";

/**
 * Interrupteur on/off — le SEUL de Racontine.
 *
 * Il existe parce que le produit avait deux contrôles pour la même idée : un
 * `role="switch"` bricolé dans « Réglages » et une case à cocher native dans
 * « Les proches », pour deux préférences qui se comportent exactement pareil
 * (elles s'appliquent au relâchement, sans bouton de validation). Un booléen
 * appliqué tout de suite est un interrupteur ; il n'en faut qu'un dessin.
 *
 * · La piste mesure 24 px de haut — la bonne taille OPTIQUE — mais la CIBLE en
 *   fait 44 (I2) : le bouton est haut de 44 px et la piste est centrée dedans.
 *   Avant, on visait un objet de 24 px (« Réglages ») ou de 16 px (la case des
 *   proches), et un pouce le ratait.
 * · Pas de `outline-none` ni de halo `ring-ring/50` : le halo global de
 *   `index.css` s'applique, et un anneau à 50 % d'opacité n'est plus mesurable.
 * · Désactivé, la piste passe en `muted` — un `opacity-50` ferait chuter le
 *   contraste sous 3:1 en silence.
 * · L'état ne tient pas QU'À la couleur : la pastille se déplace, et
 *   `aria-checked` le dit à un lecteur d'écran.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-grid size-11 shrink-0 place-items-center rounded-xl",
        "transition-colors dur-fast hover:bg-accent",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex h-6 w-11 items-center rounded-full transition-colors dur-fast",
          disabled ? "bg-muted" : checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-card shadow-card",
            "transition-transform dur-fast ease-carnet",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
