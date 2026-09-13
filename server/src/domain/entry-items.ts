import type {
  ActivityData,
  AnecdoteData,
  EntryItemData,
  HealthData,
  MealData,
  NapData,
} from "../db/schema.js";
import type { CarnetDay, TranscribedNote } from "./carnet.js";

/* ===========================================================================
   LES MOMENTS D'UNE JOURNÉE, DÉCRITS UNE SEULE FOIS.

   Un « moment » (repas, sieste, activité, anecdote, note de santé) était
   redéfini à chaque endroit qui le manipulait : une boucle dans la conversion
   d'une lecture de carnet, une deuxième dans la conversion d'une journée déjà
   transcrite, un filtre par type dans l'outil MCP qui rend une journée, et
   autant de branches côté écran. Ajouter un type de moment — « sortie »,
   « selles », « médicament » — obligeait à retrouver ces quatre listes et à les
   modifier en cœur, c'est-à-dire à en oublier une.

   Ici, un type de moment est UNE entrée de `ITEM_KINDS` : il dit son nom, où le
   trouver dans une lecture de carnet, où le trouver dans une journée transcrite
   et sous quelle forme il ressort côté lecture. Tout le reste du code parcourt
   la liste. Ajouter un type, c'est ajouter un élément ici — sans toucher à une
   seule des fonctions qui s'en servent.

   L'ORDRE DE LA LISTE EST L'ORDRE DES MOMENTS dans une journée (repas, siestes,
   activités, anecdotes, santé) : c'est lui qui donne la `position` en base, donc
   l'ordre d'affichage.
   =========================================================================== */

/** Types d'items structurés d'une journée. */
export const ITEM_TYPES = [
  "meal",
  "nap",
  "activity",
  "anecdote",
  "health",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Une ligne `entry_items` prête à insérer (l'`entryId` est ajouté par l'appelant). */
export type ItemRow = {
  type: ItemType;
  data: EntryItemData;
  position: number;
};

/**
 * Tout ce qu'il faut savoir d'un type de moment. Les signatures sont écrites en
 * méthodes (et non en propriétés fonctions) : c'est ce qui autorise chaque
 * entrée à travailler sur SA forme de données (`MealData`, `NapData`…) tout en
 * s'alignant sur ce contrat commun.
 */
export type ItemKind = {
  /** Discriminant persisté dans `entry_items.type`. */
  type: ItemType;
  /** Clé de la liste correspondante dans une journée transcrite / rendue. */
  noteKey: "meals" | "naps" | "activities" | "anecdotes" | "health";
  /** Moments de ce type dans une journée lue par le modèle vision. */
  fromCarnetDay(day: CarnetDay): EntryItemData[];
  /** Moments de ce type dans une journée fournie déjà transcrite. */
  fromNote(note: TranscribedNote): EntryItemData[];
  /** Forme rendue à la lecture (API MCP) : l'inverse de `fromNote`. */
  toNoteValue(data: EntryItemData): unknown;
};

export const ITEM_KINDS: readonly ItemKind[] = [
  {
    type: "meal",
    noteKey: "meals",
    fromCarnetDay: (day) => day.repas,
    fromNote: (note) => note.meals ?? [],
    toNoteValue: (data: MealData) => data,
  },
  {
    type: "nap",
    noteKey: "naps",
    fromCarnetDay: (day) => day.siestes,
    fromNote: (note) => note.naps ?? [],
    toNoteValue: (data: NapData) => data,
  },
  {
    type: "activity",
    noteKey: "activities",
    fromCarnetDay: (day) => day.activites.map((label) => ({ label })),
    fromNote: (note) => (note.activities ?? []).map((label) => ({ label })),
    toNoteValue: (data: ActivityData) => data.label,
  },
  {
    type: "anecdote",
    noteKey: "anecdotes",
    fromCarnetDay: (day) => day.anecdotes.map((text) => ({ text })),
    fromNote: (note) => (note.anecdotes ?? []).map((text) => ({ text })),
    toNoteValue: (data: AnecdoteData) => data.text,
  },
  {
    type: "health",
    noteKey: "health",
    // La santé est un champ libre unique dans une lecture de carnet : une note
    // vide (ou blanche) ne crée pas de moment.
    fromCarnetDay: (day) =>
      day.sante && day.sante.trim() ? [{ note: day.sante }] : [],
    fromNote: (note) => (note.health ?? []).map((text) => ({ note: text })),
    toNoteValue: (data: HealthData) => data.note,
  },
];

const KIND_BY_TYPE = new Map(ITEM_KINDS.map((k) => [k.type, k]));

/** True si la chaîne est un type de moment connu. */
export function isItemType(value: string): value is ItemType {
  return KIND_BY_TYPE.has(value as ItemType);
}

/** Numérote une suite de moments dans l'ordre où ils ont été produits. */
function positioned(
  entries: { type: ItemType; data: EntryItemData }[],
): ItemRow[] {
  return entries.map((it, position) => ({ ...it, position }));
}

/** Lecture de carnet (une journée) → lignes `entry_items` ordonnées. */
export function itemsFromCarnetDay(day: CarnetDay): ItemRow[] {
  return positioned(
    ITEM_KINDS.flatMap((kind) =>
      kind.fromCarnetDay(day).map((data) => ({ type: kind.type, data })),
    ),
  );
}

/** Journée déjà transcrite → lignes `entry_items` ordonnées. */
export function itemsFromNote(note: TranscribedNote): ItemRow[] {
  return positioned(
    ITEM_KINDS.flatMap((kind) =>
      kind.fromNote(note).map((data) => ({ type: kind.type, data })),
    ),
  );
}

/**
 * Lignes `entry_items` → listes par type, telles que les rend l'API de lecture
 * (`{ meals, naps, activities, anecdotes, health }`). Exactement l'inverse de
 * `itemsFromNote`, et bâti sur la même liste : les deux sens ne peuvent pas
 * diverger.
 */
export function itemsToNoteLists(
  items: readonly { type: ItemType; data: EntryItemData }[],
): Record<ItemKind["noteKey"], unknown[]> {
  const lists = {} as Record<ItemKind["noteKey"], unknown[]>;
  for (const kind of ITEM_KINDS) {
    lists[kind.noteKey] = items
      .filter((i) => i.type === kind.type)
      .map((i) => kind.toNoteValue(i.data));
  }
  return lists;
}
