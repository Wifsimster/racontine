import { useEffect, useRef } from "react";
import { CalendarDays, Check, ChevronDown, Rows3, X } from "lucide-react";
import type { Child, JournalMonth } from "@/lib/types";
import type { JournalMode } from "@/lib/journal-view";
import { ChildMark } from "@/components/ChildMark";
import { Button } from "@/components/ui/button";
import { capitalize, monthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ===========================================================================
   LES TROIS COMMANDES DU FIL — quel carnet, comment le lire, et où sauter.

   Elles tiennent sur UNE ligne de 44 px sous le titre, et c'est la contrainte
   qui a dicté leur forme : le journal a déjà un bandeau d'écran, un bandeau de
   mois collant et un bouton flottant ; une quatrième barre aurait mangé le pli.
   Le choix du carnet ne s'affiche donc qu'à partir de DEUX enfants, et le saut
   de mois est porté par le bandeau de mois lui-même — qui était jusqu'ici un
   panneau indicateur, jamais une porte.
   =========================================================================== */

/**
 * Le carnet qu'on lit. Rien à ouvrir, rien à replier : deux ou trois pastilles
 * en clair. « Tous » d'abord, parce que c'est l'état de départ et qu'un foyer
 * lit souvent les deux enfants ensemble.
 */
export function ChildFilter({
  children,
  value,
  onChange,
}: {
  children: Child[];
  value: string | null;
  onChange: (childId: string | null) => void;
}) {
  if (children.length < 2) return null;
  return (
    <div
      role="group"
      aria-label="Quel carnet lire"
      /* Le rail déborde des gouttières et défile : à 320 px, trois pastilles
         et le bouton de mode ne tiennent pas sur une ligne. `pr-2` laisse un
         blanc entre la dernière pastille et le bouton, pour que la coupe se
         lise comme un défilement et non comme un recouvrement. */
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pr-2 pb-1"
    >
      <Button
        variant={value === null ? "default" : "outline"}
        size="sm"
        aria-pressed={value === null}
        className="shrink-0 snap-start"
        onClick={() => onChange(null)}
      >
        Tous
      </Button>
      {children.map((c) => (
        <Button
          key={c.id}
          variant={value === c.id ? "default" : "outline"}
          size="sm"
          aria-pressed={value === c.id}
          className="shrink-0 snap-start"
          onClick={() => onChange(c.id)}
        >
          {/* La pastille reste ACHROMATIQUE ici aussi : elle désigne, elle ne
              colore pas — les feutres ont déjà pris les couleurs. */}
          <ChildMark name={c.name} current={value === c.id} />
          {c.name}
        </Button>
      ))}
    </div>
  );
}

/**
 * Lire ou parcourir. Ce n'est pas une préférence d'affichage, c'est un geste
 * différent : « lire » déroule les journées entières (488 px pièce, 1,7 par
 * écran) ; « parcourir » les réduit à une ligne (11 par écran) pour chercher
 * une journée dont on ne connaît que le mois. Le choix est mémorisé.
 */
export function ModeToggle({
  value,
  onChange,
}: {
  value: JournalMode;
  onChange: (mode: JournalMode) => void;
}) {
  const parcourt = value === "parcourir";
  /* Pas d'`aria-pressed` ici : le libellé dit ce que le bouton VA FAIRE, et un
     bouton « Lire » annoncé « pressé » se contredirait à voix haute. */
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onChange(parcourt ? "lire" : "parcourir")}
    >
      <Rows3 aria-hidden="true" />
      {parcourt ? "Lire" : "Parcourir"}
    </Button>
  );
}

/**
 * LE SAUT DE MOIS — la table des matières du carnet.
 *
 * Le bandeau de mois disait où l'on était sans jamais emmener ailleurs :
 * atteindre la rentrée de l'an dernier se payait en une douzaine d'appuis sur
 * « voir les journées précédentes ». Il devient un bouton, et le panneau qu'il
 * ouvre est la seule liste de l'app où l'on voit le carnet en entier : un mois
 * par ligne, son nombre de journées, le mois courant marqué.
 *
 * Panneau et non feuille modale : c'est le même objet que le menu de la
 * coquille (voile, `panel-down`, Échap, focus rendu au bouton) — l'app n'a pas
 * deux façons d'ouvrir une liste.
 */
export function MonthJump({
  id,
  months,
  current,
  active,
  open,
  onOpen,
  onClose,
  onJump,
}: {
  /** Identifiant du titre de section — le mois reste un `h2` repérable. */
  id?: string;
  months: JournalMonth[];
  /** Le mois en tête de l'écran, pour le marquer dans la liste. */
  current: string | null;
  /** Le mois d'où l'on est reparti, s'il y a eu un saut. */
  active: string | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onJump: (month: string | null) => void;
}) {
  const boutonRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
      boutonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // À l'ouverture, le focus entre dans le panneau : au clavier comme au
  // lecteur d'écran, la liste doit être là où l'on vient d'appuyer.
  useEffect(() => {
    if (open) panneauRef.current?.focus();
  }, [open]);

  const label = current ? capitalize(monthYear(`${current}-01`)) : "Le carnet";

  return (
    <>
      {/* Un `h2` qui PORTE un bouton, et non un bouton à la place du titre : le
          mois reste un repère de navigation pour un lecteur d'écran, et il
          devient une porte pour tout le monde. La cible fait toute la hauteur
          du bandeau (44 px), pas celle du texte. */}
      {/* `z-40` : le voile du panneau (z-30) couvre la page, mais pas le
          bandeau depuis lequel on vient d'appuyer — un bouton qui grise au
          moment où on l'active donne l'impression d'avoir raté sa cible. */}
      <h2 id={id} className="relative z-40 flex">
        <button
          ref={boutonRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={open ? onClose : onOpen}
          className="-ml-1 flex h-full items-end gap-1.5 rounded-lg px-1 pb-2 transition-colors dur-fast hover:bg-accent"
        >
          <span className="surtitre text-muted-foreground">{label}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </h2>

      {/* Le VOILE n'est pas ici : il est posé par le journal, hors du bandeau
          collant. Enfant du bandeau, il en aurait recouvert le fond — le mois
          sur lequel on vient d'appuyer serait passé au gris pendant qu'on le
          lit. */}
      {open && (
        <>
          <div
            ref={panneauRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Aller à un mois du carnet"
            className="panel-down absolute inset-x-0 top-full z-40 mt-1"
          >
            <div className="max-h-[60svh] overflow-y-auto rounded-2xl border bg-popover p-2 text-popover-foreground shadow-lift">
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <p className="surtitre text-muted-foreground">
                  {months.length} mois de carnet
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fermer la liste des mois"
                  onClick={onClose}
                >
                  <X />
                </Button>
              </div>

              {/* Le retour au présent : visible seulement quand on a sauté,
                  parce qu'un « revenir » sans départ ne veut rien dire. */}
              {active && (
                <button
                  type="button"
                  onClick={() => onJump(null)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors dur-fast hover:bg-accent"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-ui font-bold">
                    Les journées les plus récentes
                  </span>
                </button>
              )}

              <ul>
                {months.map((m) => {
                  const ici = m.month === (active ?? current);
                  return (
                    <li key={m.month}>
                      <button
                        type="button"
                        aria-current={ici ? "true" : undefined}
                        onClick={() => onJump(m.month)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors dur-fast hover:bg-accent aria-[current]:bg-primary-soft"
                      >
                        <span className="min-w-0 flex-1 truncate text-ui font-bold">
                          {capitalize(monthYear(`${m.month}-01`))}
                        </span>
                        <span
                          className="shrink-0 text-meta text-muted-foreground"
                          data-tabular
                        >
                          {m.count} journée{m.count > 1 ? "s" : ""}
                        </span>
                        {ici && (
                          <Check
                            className="size-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {months.length === 0 && (
                <p className="px-2 py-3 text-meta text-muted-foreground">
                  Le carnet n'a pas encore de mois à parcourir.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Le voile du panneau des mois, posé au niveau de la page (cf. ci-dessus). */
export function MonthJumpVeil({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30 bg-overlay"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}
