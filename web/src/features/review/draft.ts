import {
  type EntryItem,
  type EntrySource,
  type ItemType,
  type Uncertainty,
} from "@/lib/types";
import { itemKind } from "@/lib/items";

/* Le BROUILLON en cours de relecture : ce qui distingue un travail modifié
   d'un travail intact, et ce qu'on envoie au serveur. Fonctions pures. */

/** Un moment de la journée en cours d'édition (champs à plat, tous en texte). */
export type DraftItem = {
  type: ItemType;
  data: Record<string, string>;
  position: number;
};

/** Les moments d'une journée chargée → brouillon éditable. */
export function toDraftItems(items: EntryItem[]): DraftItem[] {
  return items.map((it, i) => ({
    type: it.type,
    data: { ...(it.data as Record<string, string>) },
    position: it.position ?? i,
  }));
}

/** Un moment vierge du type demandé (les champs viennent du registre). */
export function emptyDraft(type: ItemType): Record<string, string> {
  return itemKind(type).emptyDraft();
}

/**
 * Ce qu'une ligne de coup d'œil dit d'un moment : son libellé (le moment du
 * repas, « Sieste »…) et sa valeur en une phrase. C'est volontairement une
 * PROJECTION, pas un formulaire : on lit, on ne corrige pas ici. Le détail de
 * chaque type vit dans le registre `lib/items`.
 */
export function glanceOf(it: DraftItem): { label: string; value: string } {
  return itemKind(it.type).summarize(it.data);
}

export function pruneEmpty(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * Empreinte d'une journée, pour savoir s'il y a du travail à perdre.
 *
 * Elle applique EXACTEMENT les normalisations de `currentPatch` — coupe des
 * blancs, chaîne vide ramenée à `null`, champs vides élagués des moments,
 * positions renumérotées — et dans le MÊME ordre de clés, puisque la
 * comparaison se fait sur le JSON. Toute divergence ferait apparaître une
 * modification là où il n'y en a pas, et le garde-fou crierait à l'ouverture de
 * l'écran.
 */
export function fingerprint(v: {
  title: string | null;
  story: string | null;
  highlight: string | null;
  mood: string | null;
  transcription: string | null;
  source: EntrySource;
  date: string;
  items: DraftItem[];
}): string {
  return JSON.stringify({
    title: v.title?.trim() || null,
    story: v.story?.trim() || null,
    highlight: v.highlight?.trim() || null,
    mood: v.mood || null,
    transcription: v.transcription || null,
    source: v.source,
    date: v.date,
    items: v.items
      .map((it, position) => ({
        type: it.type,
        data: pruneEmpty(it.data),
        position,
      }))
      .filter((it) => Object.keys(it.data).length > 0),
  });
}

/** Tolère les anciennes entrées où `uncertainties` était un simple tableau de chaînes. */
export function normalizeUncertainties(raw: unknown): Uncertainty[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((u) =>
    typeof u === "string"
      ? { original: u, contexte: "", suggestions: [], champ: null, resolved: null }
      : (u as Uncertainty),
  );
}

