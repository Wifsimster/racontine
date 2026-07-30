import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/* ===========================================================================
   Les écrans de réglage (« Partager », « Proches », « Réglages », « Mon
   compte ») partagent une coquille et TROIS états dessinés.

   Pourquoi ce module existe : le journal, la capture et la relecture ont chacun
   reçu leur bandeau, leur squelette et leur écran d'erreur — dessinés, mesurés,
   et à chaque fois réécrits sur place. Les quatre écrans de réglage, eux,
   étaient restés à « Chargement… » centré, à un `<p>` rouge pour toute erreur et
   à un `h1` sans-serif : le même produit changeait de langue au troisième
   onglet. Plutôt que de recopier une quatrième fois le bandeau du journal, on
   nomme le vocabulaire UNE fois ici.

   Les trois états ne sont pas décoratifs, ils sont l'invariant I7 : une page qui
   charge montre la FORME de sa réponse, une page vide dit ce qui la remplira, et
   une page en erreur dit ce qui est intact et ce qu'on peut faire.
   =========================================================================== */

/** La colonne de lecture, l'axe partagé avec l'en-tête (`--shell-max`). */
export function PageShell({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("shell-width flex flex-col gap-6 px-4 pt-4 pb-8", className)}
      {...props}
    />
  );
}

/**
 * Le bandeau d'écran : le seul cran 30/36 de la page, en sérif, comme « Le
 * journal ». La coquille porte le nom de l'INSTANCE, cette ligne porte le nom de
 * l'ÉCRAN — et elle ne dépend pas des données (elle reste pendant le
 * chargement, le vide et l'erreur, exactement là où l'on est le plus perdu).
 *
 * Pas d'icône à côté du titre : les quatre écrans en avaient une, de 20 px,
 * posée contre une capitale de 30 px qu'elle n'arrivait pas à aligner. Le titre
 * se tient seul.
 */
export function PageHeader({
  title,
  lede,
}: {
  title: string;
  lede?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-serif text-display font-semibold">{title}</h1>
      {lede && (
        <p className="max-w-[46ch] text-ui text-pretty text-muted-foreground">
          {lede}
        </p>
      )}
    </header>
  );
}

/**
 * Intertitre de section. C'est le surtitre du carnet (11/16, capitales, 0,14 em)
 * — le même objet que le mois du journal, et non un `text-xs font-semibold
 * uppercase tracking-wide` réinventé sur chaque écran.
 */
export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("surtitre text-muted-foreground", className)}
      {...props}
    />
  );
}

const TONE = {
  /* Un état vide n'est pas une panne : il est encre pâlie, pas rouge. */
  neutral: "bg-muted text-muted-foreground",
  /* Une porte fermée par un rôle : groseille pâle, la couleur de la marque. */
  locked: "bg-primary-soft text-primary",
  error: "bg-destructive-soft text-destructive",
} as const;

/**
 * Un état plein écran : vide, interdit ou en panne. Même géométrie que l'écran
 * d'erreur du journal — tuile de 64 px, titre sérif, une phrase de 34 caractères
 * de mesure, puis les actions.
 *
 * La hauteur retirée est celle du chrome et du bandeau : le bloc se centre dans
 * ce qui RESTE de l'écran, au lieu de se centrer dans la page entière et de
 * laisser un vide sous lui.
 */
export function PageState({
  icon: Icon,
  tone = "neutral",
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONE;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      role={tone === "error" ? "alert" : undefined}
      className="rise-enter flex min-h-[calc(100svh-16rem)] flex-col items-center justify-center gap-5 text-center"
    >
      <span
        aria-hidden="true"
        className={cn("grid size-16 place-items-center rounded-3xl", TONE[tone])}
      >
        <Icon className="size-7" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          {title}
        </h2>
        {children && (
          <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
            {children}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-3">{actions}</div>
      )}
    </section>
  );
}

/**
 * Le chargement montre la forme de ce qui arrive : des cartes fantômes au
 * gabarit réel. Au bout de trois secondes il dit qu'il est long — la seule chose
 * honnête quand on ne connaît ni total ni progression.
 *
 * Le message est un `role="status"` : un lecteur d'écran l'entend, les carrés
 * gris lui sont cachés.
 */
export function PageSkeleton({
  label = "On ouvre le carnet",
  slowLabel = "Le carnet met du temps à venir",
  rows = 2,
}: {
  label?: string;
  slowLabel?: string;
  rows?: number;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-11 items-end justify-between gap-3 border-b pb-2">
        <p role="status" className="surtitre text-muted-foreground">
          {slow ? slowLabel : label}
        </p>
        {/* Le point respire au rythme de la balayeuse des squelettes
            (1200 ms, déclarée dans index.css) : pas de seconde boucle. */}
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-5 w-44" />
          <div className="skeleton mt-4 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Un message d'erreur INLINE, pour un geste qui a échoué sans faire tomber
 * l'écran (une invitation refusée, un rôle qu'on n'a pas pu changer). Il porte
 * une icône et un fond mesuré, au lieu d'être un `<p>` rouge dans le flux : sur
 * papier crème, une ligne rouge de 13 px se lit comme une légende, pas comme un
 * refus.
 */
export function InlineError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl bg-destructive-soft px-3 py-2 text-meta text-destructive",
        className,
      )}
    >
      {children}
    </p>
  );
}
