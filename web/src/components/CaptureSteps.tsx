import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/* ===========================================================================
   LES QUATRE TEMPS D'UNE JOURNÉE : photo → lecture → relecture → partage.

   C'est le seul objet de chrome de l'écran de capture, et il porte deux
   promesses en 56 px : « tu es au début » et « c'est court ».

   RÈGLE D'ÉTAT : chaque état a son PROPRE GLYPHE, jamais seulement sa couleur.
     · fait      : une coche sur un rond d'encre plein
     · en cours  : un point de 8 px dans un anneau d'encre de 2 px
     · échoué    : un triangle sur fond destructive-soft, anneau de 2 px
     · à venir   : un anneau de champ de 2 px, vide
   Enlevez la couleur (impression noir et blanc, daltonisme, mode contraste) :
   les quatre états restent distincts. C'est le point que la planche de
   référence gagne le plus souvent contre les vraies applications.

   POURQUOI LE CHEMIN EST À L'ENCRE, ET PAS EN GROSEILLE — la correction qui
   compte le plus sur cet écran. Groseille (--primary) et rouge (--destructive)
   ont la même clarté OKLCH par construction : 1,08:1 entre elles en clair,
   1,00:1 en sombre, 17° et 14° d'écart de teinte. Un chemin en groseille et un
   échec en rouge étaient donc PERCEPTUELLEMENT LA MÊME COULEUR, et les cinq
   marques de l'écran (rond franchi, anneau courant, filet, pastille, bouton)
   ne disaient plus que trois choses. Le chemin est désormais tracé à l'encre du
   carnet (--foreground) : groseille est réservé à l'ACTION (le bouton de la
   barre), et l'échec devient la seule teinte saturée du rail. Écart mesuré sur
   le DOM réel (gauntlet/probe/r2-cap-hue.js), échec vs rond franchi :
   2,17:1 / ΔH 111° en clair et 2,15:1 / ΔH 63° en sombre, contre 1,08:1 / 16° et
   1,00:1 / 16° avant. Et surtout la CHROMA fait le travail : 0,055 (encre) contre
   0,180 (rouge) en clair, 0,012 contre 0,150 en sombre — le rond en échec est la
   seule marque saturée au milieu de ronds d'encre.
   L'anneau « à venir » passe de `--border` à `--input` au passage : 1,26:1 sur le
   papier, c'était un anneau qu'un œil fatigué ne trouvait pas ; 1,43:1 en clair
   et 1,85:1 en sombre maintenant.

   Les pas ne sont PAS cliquables — c'est un indicateur, pas une navigation :
   on ne peut pas « aller au partage » avant d'avoir photographié. Rien ici ne
   doit donc faire 44 px, et rien ne prend le focus.
   =========================================================================== */

export type StepState = "done" | "current" | "todo" | "failed";

export type Step = {
  key: string;
  label: string;
  state: StepState;
};

/** Ce que le glyphe dit à voix haute — l'état ne vit pas que dans la teinte. */
const SPOKEN: Record<StepState, string> = {
  done: "terminé",
  current: "en cours",
  todo: "à venir",
  failed: "échoué",
};

export function CaptureSteps({
  steps,
  className,
}: {
  steps: Step[];
  className?: string;
}) {
  return (
    <ol
      aria-label="Les étapes de la journée"
      className={cn("flex items-start", className)}
    >
      {steps.map((step, i) => {
        // Le trait relie le pas PRÉCÉDENT à celui-ci : il passe à l'encre dès
        // que le précédent est franchi, exactement comme dans la planche de
        // référence (`.step.done + .step::before`).
        const linkDone = i > 0 && steps[i - 1].state === "done";
        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-1"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                /* top-[13px] : centrage OPTIQUE du filet de 2 px sur le rond de
                   28 px (14 - 1). Ce n'est ni une marge ni un espacement de
                   mise en page, c'est un alignement à l'œil. */
                className={cn(
                  "absolute top-[13px] right-1/2 h-0.5 w-full rounded-full transition-colors dur-slow ease-carnet",
                  linkDone ? "bg-foreground" : "bg-border",
                )}
              />
            )}

            {/* `z-10` : le filet du pas SUIVANT court d'un centre à l'autre et
                passe donc SOUS ce rond. Sans lui, le trait du voisin de droite
                (plus loin dans le DOM, donc peint au-dessus) traversait le
                glyphe — la ligne barrait la coche et le point exactement comme
                une réglure barre une letterform. Tous les fonds de rond sont
                opaques, la ligne disparaît proprement dessous. */}
            <span
              className={cn(
                "relative z-10 grid size-7 place-items-center rounded-full transition-colors dur-slow ease-carnet",
                step.state === "done" && "bg-foreground text-background",
                step.state === "current" &&
                  "border-2 border-foreground bg-card",
                step.state === "failed" &&
                  "border-2 border-destructive bg-destructive-soft text-destructive",
                // `border-input` et non `border-border` : le filet du papier
                // mesure 1,26:1 sur le fond en clair — un anneau vide qu'un œil
                // fatigué ne trouve pas. `--input` est le même filet, « plus
                // affirmé », et c'est exactement son rôle dans le système.
                step.state === "todo" && "border-2 border-input bg-card",
              )}
              role="img"
              aria-label={SPOKEN[step.state]}
            >
              {step.state === "done" && <Check className="size-4" />}
              {step.state === "current" && (
                <span className="size-2 rounded-full bg-foreground" />
              )}
              {step.state === "failed" && <TriangleAlert className="size-4" />}
            </span>

            {/* 11/16, deux lignes possibles : à 320 px « Relecture » tient sur
                une seule, mais on réserve la place pour qu'aucun mot ne soit
                rogné et que les ronds restent alignés.
                Le pas courant est en encre GRASSE, le pas échoué est le SEUL
                libellé coloré de la ligne. */}
            <span
              className={cn(
                "min-h-4 text-center text-xs",
                step.state === "current"
                  ? "font-bold text-foreground"
                  : step.state === "failed"
                    ? "font-bold text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
