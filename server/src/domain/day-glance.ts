import type { EntryItemData, NapData } from "../db/schema.js";
import type { ItemType } from "./entry-items.js";

/* ===========================================================================
   LA BANDE DE FEUTRES D'UNE JOURNÉE — « 2 repas · sieste 2 h 05 · joyeuse ».

   C'est le résumé que le journal affiche en tête de carte, et que l'e-mail de
   publication reprend au caractère près : une même journée ne peut pas se
   résumer différemment selon qu'on la lit dans l'app ou dans sa boîte.

   Le calcul est ICI, en fonctions pures — il ne lit ni base, ni réglage, et se
   vérifie sans rien démarrer. L'adaptateur va chercher les moments, le gabarit
   d'e-mail les peint ; ni l'un ni l'autre ne refait ce calcul.
   =========================================================================== */

/** Espace insécable : « 2 h 05 » — typographie française. */
const NBSP = "\u00a0";

function parseTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

/** L'humeur en un mot, comme sur la bande de feutres du journal. */
function moodShort(mood: string): string | null {
  const first = mood.split(/[,;]| et | puis /i)[0].trim();
  if (first.length <= 16) return first;
  const cut = first.slice(0, 16);
  const space = cut.lastIndexOf(" ");
  return space >= 4 ? cut.slice(0, space) + "\u2026" : null;
}

/**
 * Une pastille de la bande. `tone` n'est PAS une couleur : c'est ce que la
 * pastille dit — un feutre de type de moment, ou le neutre de l'humeur. Les
 * teintes appartiennent à la surface qui peint (voir `email-template.ts`).
 *
 * DEUX FEUTRES, ET UN NEUTRE, et ce n'est pas un oubli : l'humeur n'est pas un
 * type de moment. Le journal le dit explicitement (« l'humeur reste à
 * l'encre ; cette absence de feutre est une information ») et la règle du
 * système l'impose — le prune veut dire « anecdote », il ne peut pas vouloir
 * dire « joyeuse » deux centimètres plus bas.
 */
export type DayChip = { label: string; tone: "meal" | "nap" | "mood" };

/**
 * La bande d'une journée, dans l'ORDRE des questions qu'on se pose en ouvrant
 * l'app : a-t-il mangé, a-t-il dormi, comment était-il. Trois pastilles au plus
 * — la même règle qu'à l'écran, pour la même raison : au-delà, la bande crie
 * plus fort que le titre.
 *
 * Les mots sont ceux du journal, au caractère près (« sieste 2 h 05 » pour une
 * seule, « siestes 2 h 05 » pour le cumul).
 */
export function dayChips(day: {
  items: readonly { type: ItemType; data: EntryItemData }[];
  mood: string | null;
}): DayChip[] {
  const chips: DayChip[] = [];

  const meals = day.items.filter((i) => i.type === "meal");
  if (meals.length > 0)
    chips.push({ label: `${meals.length} repas`, tone: "meal" });

  const naps = day.items.filter((i) => i.type === "nap");
  if (naps.length > 0) {
    let total = 0;
    for (const n of naps) {
      const d = n.data as NapData;
      const a = parseTime(d.debut);
      const b = parseTime(d.fin);
      if (a !== null && b !== null && b > a) total += b - a;
    }
    const noun = naps.length > 1 ? "siestes" : "sieste";
    chips.push({
      label:
        total > 0 ? `${noun} ${formatDuration(total)}` : `${naps.length} ${noun}`,
      tone: "nap",
    });
  }

  const short = day.mood ? moodShort(day.mood) : null;
  if (short) chips.push({ label: short, tone: "mood" });

  return chips;
}
