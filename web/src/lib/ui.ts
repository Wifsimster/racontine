import type { ItemType, EntrySource, EntryStatus } from "./types";

/* ===========================================================================
   Le vocabulaire chromatique de Racontine.

   RÈGLE : un écran choisit UNE dimension à colorer et ne colore rien d'autre.

   · Sur le journal, la dimension colorée est le TYPE DE MOMENT — les cinq
     feutres du carnet (`ITEM_*`). Tout le reste y est encre, encre pâlie ou
     filet.
   · Sur la relecture, la dimension colorée est la CONFIANCE (`STATUS_*`,
     `success` / `warning`) : les feutres de catégorie y passent volontairement
     en gris, sinon l'écran a deux systèmes de couleur qui se disputent.

   C'est pourquoi la provenance (`SOURCE_BADGE`) n'a AUCUNE couleur propre :
   elle réutilisait les cinq feutres, si bien que le rose voulait dire « nounou »
   sur le journal et « anecdote » deux centimètres plus bas. Une teinte ne peut
   pas signifier deux choses. La provenance se lit dans son libellé
   (`SOURCE_LABELS`), qui reste lisible même sans couleur.

   Toutes les paires (encre, fond) sont mesurées >= 5,9:1 dans les deux thèmes.
   =========================================================================== */

/** Tuile d'icône colorée par type de moment (le « feutre » de la catégorie). */
export const ITEM_CHIP: Record<ItemType, string> = {
  meal: "bg-meal-bg text-meal",
  nap: "bg-nap-bg text-nap",
  activity: "bg-activity-bg text-activity",
  anecdote: "bg-anecdote-bg text-anecdote",
  health: "bg-health-bg text-health",
};

/** L'encre seule, pour un libellé ou une icône posés à même le papier. */
export const ITEM_INK: Record<ItemType, string> = {
  meal: "text-meal",
  nap: "text-nap",
  activity: "text-activity",
  anecdote: "text-anecdote",
  health: "text-health",
};

/** Puce pleine : point de la frise, trait de rail, pastille de légende. */
export const ITEM_DOT: Record<ItemType, string> = {
  meal: "bg-meal",
  nap: "bg-nap",
  activity: "bg-activity",
  anecdote: "bg-anecdote",
  health: "bg-health",
};

/**
 * Pastille de provenance : volontairement neutre (voir l'en-tête). Le sens est
 * porté par le mot, pas par la teinte.
 */
export const SOURCE_BADGE: Record<EntrySource, string> = {
  nounou: "bg-muted text-muted-foreground",
  mam: "bg-muted text-muted-foreground",
  creche: "bg-muted text-muted-foreground",
  maison: "bg-muted text-muted-foreground",
};

/**
 * État d'une journée. La couleur double une forme : à l'usage, on passe aussi
 * une icône (`Check`, `PenLine`, `Loader2`, `TriangleAlert`) pour que l'état
 * reste lisible sans couleur.
 */
export const STATUS_BADGE: Record<EntryStatus, string> = {
  processing: "bg-muted text-muted-foreground",
  draft: "bg-warning-bg text-warning",
  published: "bg-success-bg text-success",
  failed: "bg-destructive-soft text-destructive",
};
