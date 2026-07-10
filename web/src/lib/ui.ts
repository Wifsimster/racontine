import type { ItemType, EntrySource } from "./types";

/** Puce d'icône colorée par type de moment (le « feutre » de la catégorie). */
export const ITEM_CHIP: Record<ItemType, string> = {
  meal: "bg-meal-bg text-meal",
  nap: "bg-nap-bg text-nap",
  activity: "bg-activity-bg text-activity",
  anecdote: "bg-anecdote-bg text-anecdote",
  health: "bg-health-bg text-health",
};

/** Pastille de source, teintée. */
export const SOURCE_BADGE: Record<EntrySource, string> = {
  nounou: "bg-anecdote-bg text-anecdote",
  mam: "bg-nap-bg text-nap",
  creche: "bg-meal-bg text-meal",
  maison: "bg-activity-bg text-activity",
};
