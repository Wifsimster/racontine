import type { ItemType, EntrySource, EntryStatus } from "./types";

export const ITEM_CHIP: Record<ItemType, string> = {
  meal: "bg-meal-bg text-meal",
  nap: "bg-nap-bg text-nap",
  activity: "bg-activity-bg text-activity",
  anecdote: "bg-anecdote-bg text-anecdote",
  health: "bg-health-bg text-health",
};

export const ITEM_INK: Record<ItemType, string> = {
  meal: "text-meal",
  nap: "text-nap",
  activity: "text-activity",
  anecdote: "text-anecdote",
  health: "text-health",
};

export const ITEM_DOT: Record<ItemType, string> = {
  meal: "bg-meal",
  nap: "bg-nap",
  activity: "bg-activity",
  anecdote: "bg-anecdote",
  health: "bg-health",
};

export const SOURCE_BADGE: Record<EntrySource, string> = {
  nounou: "bg-muted text-muted-foreground",
  mam: "bg-muted text-muted-foreground",
  creche: "bg-muted text-muted-foreground",
  maison: "bg-muted text-muted-foreground",
};

export const STATUS_BADGE: Record<EntryStatus, string> = {
  processing: "bg-muted text-muted-foreground",
  draft: "bg-warning-bg text-warning",
  published: "bg-success-bg text-success",
  failed: "bg-destructive-soft text-destructive",
};
