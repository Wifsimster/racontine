import type { ReactNode } from "react";
import {
  Baby,
  Cookie,
  HeartPulse,
  Moon,
  Soup,
  Sparkles,
  Sun,
  Sunrise,
} from "lucide-react";
import {
  ITEM_LABELS,
  type ActivityData,
  type AnecdoteData,
  type EntryItem,
  type HealthData,
  type ItemType,
  type MealData,
  type NapData,
} from "./types";
import { ITEM_CHIP } from "./ui";
import { NBSP, formatClock, formatDuration, fr, parseTime } from "./format";

/* ===========================================================================
   LES CINQ MOMENTS D'UNE JOURNÉE, DÉCRITS UNE SEULE FOIS.

   « Repas, sieste, activité, anecdote, santé » étaient réécrits à chaque écran :
   une table d'icônes dans le journal, une autre dans la relecture, un `switch`
   pour le résumé d'un moment, une cascade de `if (item.type === …)` pour la
   ligne de détail, une table de champs pour le formulaire, une liste de types à
   proposer à l'ajout. Six endroits pour un même vocabulaire — et le sixième
   type de moment, le jour où il arrivera, devra être ajouté aux six.

   Un type de moment est ici UNE entrée de `ITEM_KINDS` : son nom, son feutre,
   ses champs, son résumé, sa pastille de coup d'œil et sa ligne de détail. Les
   écrans parcourent la liste ; ils ne la connaissent plus.
   =========================================================================== */

type LucideIcon = typeof Soup;

/** Un champ éditable d'un moment, dans l'ordre où il se saisit. */
export type ItemField = {
  key: string;
  label: string;
  /** Champ de PROSE : zone de texte qui grandit plutôt qu'une ligne. */
  long: boolean;
};

/** Ce que la bande de feutres du journal dit d'un type de moment. */
export type ItemGlance = { value: string; spoken: string };

export type ItemKind = {
  type: ItemType;
  /** Libellé humain (« Repas », « Sieste »…). */
  label: string;
  /** Glyphe par défaut du type. */
  Icon: LucideIcon;
  /** Classe du feutre coloré (journal). */
  chip: string;
  /**
   * Rang d'importance dans la bande de coup d'œil, quand il y a plus de trois
   * pastilles : la santé d'abord — le bobo, la fièvre, le médicament, c'est ce
   * qu'un parent ouvre l'app pour trouver.
   */
  glanceRank: number;
  /** Glyphe affiné selon le contenu (un repas change avec le moment). */
  iconFor(item: EntryItem): LucideIcon;
  /** Champs éditables à la relecture. */
  fields: ItemField[];
  /** Brouillon vide de ce type. */
  emptyDraft(): Record<string, string>;
  /** Résumé d'un moment : son libellé et sa valeur en une phrase. */
  summarize(data: Record<string, string>): { label: string; value: string };
  /** Pastille de coup d'œil pour tous les moments de ce type, ou null. */
  glance(items: EntryItem[]): ItemGlance | null;
  /** Contenu de la ligne de détail sur le journal (hors puce). */
  renderLine(item: EntryItem): ReactNode;
};

/** Joint des morceaux non vides par « · ». */
function join(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Accord au pluriel d'un compte (« 2 activités »). */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Icône de repas selon le moment de la journée (à défaut, un bol). */
function mealIcon(moment?: string): LucideIcon {
  const m = (moment ?? "").toLowerCase();
  if (m.includes("matin") || m.includes("réveil") || m.includes("petit-déj"))
    return Sunrise;
  if (m.includes("midi") || m.includes("déjeun") || m.includes("dîner"))
    return Sun;
  if (m.includes("goûter") || m.includes("gouter") || m.includes("collation"))
    return Cookie;
  return Soup;
}

export const ITEM_KINDS: readonly ItemKind[] = [
  {
    type: "meal",
    label: ITEM_LABELS.meal,
    Icon: Soup,
    chip: ITEM_CHIP.meal,
    glanceRank: 1,
    iconFor: (item) => mealIcon((item.data as MealData).moment),
    fields: [
      { key: "moment", label: "Moment", long: false },
      { key: "contenu", label: "Contenu", long: true },
      { key: "appetit", label: "Appétit", long: false },
    ],
    emptyDraft: () => ({ moment: "", contenu: "", appetit: "" }),
    summarize: (d) => ({
      label: d.moment?.trim() || ITEM_LABELS.meal,
      value: join(d.contenu, d.appetit),
    }),
    glance: (items) =>
      items.length
        ? { value: plural(items.length, "repas", "repas"), spoken: "repas" }
        : null,
    renderLine: (item) => {
      const d = item.data as MealData;
      return (
        <span>
          <span className="font-bold">{fr(d.moment)}</span> — {fr(d.contenu)}
          {d.appetit ? ` (${fr(d.appetit)})` : ""}
        </span>
      );
    },
  },
  {
    type: "nap",
    label: ITEM_LABELS.nap,
    Icon: Moon,
    chip: ITEM_CHIP.nap,
    glanceRank: 2,
    iconFor: () => Moon,
    fields: [
      { key: "debut", label: "Début", long: false },
      { key: "fin", label: "Fin", long: false },
      { key: "note", label: "Note", long: true },
    ],
    emptyDraft: () => ({ debut: "", fin: "", note: "" }),
    summarize: (d) => {
      const span =
        d.debut?.trim() && d.fin?.trim()
          ? `${d.debut.trim()} → ${d.fin.trim()}`
          : d.debut?.trim() || d.fin?.trim() || "";
      return { label: ITEM_LABELS.nap, value: join(span, d.note) };
    },
    glance: (items) => {
      if (!items.length) return null;
      let total = 0;
      for (const n of items) {
        const d = n.data as NapData;
        const a = parseTime(d.debut);
        const b = parseTime(d.fin);
        if (a !== null && b !== null && b > a) total += b - a;
      }
      // Le mot AVANT la durée, et son nombre dit si c'est un cumul : « sieste
      // 2 h 05 » (une seule) contre « siestes 2 h 05 » (le total du jour).
      const noun = items.length > 1 ? "siestes" : "sieste";
      return {
        value:
          total > 0
            ? `${noun} ${formatDuration(total)}`
            : `${items.length} ${noun}`,
        spoken: "sieste",
      };
    },
    renderLine: (item) => {
      const d = item.data as NapData;
      const a = formatClock(d.debut);
      const b = formatClock(d.fin);
      const from = parseTime(d.debut);
      const to = parseTime(d.fin);
      const dur = from !== null && to !== null && to > from ? to - from : null;
      return (
        <span>
          <span className="font-bold">Sieste</span>{" "}
          <span data-tabular>
            {a ?? "?"}
            {b ? ` → ${b}` : ""}
          </span>
          {dur ? ` (${formatDuration(dur)})` : ""}
          {d.note ? ` · ${fr(d.note)}` : ""}
        </span>
      );
    },
  },
  {
    type: "activity",
    label: ITEM_LABELS.activity,
    Icon: Sparkles,
    chip: ITEM_CHIP.activity,
    glanceRank: 4,
    iconFor: () => Sparkles,
    fields: [{ key: "label", label: "Activité", long: true }],
    emptyDraft: () => ({ label: "" }),
    summarize: (d) => ({ label: ITEM_LABELS.activity, value: join(d.label) }),
    glance: (items) =>
      items.length
        ? { value: plural(items.length, "activité"), spoken: "activités" }
        : null,
    renderLine: (item) => <span>{fr((item.data as ActivityData).label)}</span>,
  },
  {
    type: "anecdote",
    label: ITEM_LABELS.anecdote,
    Icon: Baby,
    chip: ITEM_CHIP.anecdote,
    glanceRank: 5,
    iconFor: () => Baby,
    fields: [{ key: "text", label: "Anecdote", long: true }],
    emptyDraft: () => ({ text: "" }),
    summarize: (d) => ({ label: ITEM_LABELS.anecdote, value: join(d.text) }),
    glance: (items) =>
      items.length
        ? { value: plural(items.length, "anecdote"), spoken: "anecdotes" }
        : null,
    renderLine: (item) => (
      /* Les guillemets ET l'encre prune : le mot d'enfant reste reconnaissable
         même en noir et blanc. Pas d'italique — aucune fonte italique n'est
         embarquée, l'oblique serait synthétique. */
      <span className="text-anecdote">
        «{NBSP}
        {fr((item.data as AnecdoteData).text)}
        {NBSP}»
      </span>
    ),
  },
  {
    type: "health",
    label: ITEM_LABELS.health,
    Icon: HeartPulse,
    chip: ITEM_CHIP.health,
    glanceRank: 0,
    iconFor: () => HeartPulse,
    fields: [{ key: "note", label: "Note", long: true }],
    emptyDraft: () => ({ note: "" }),
    summarize: (d) => ({ label: ITEM_LABELS.health, value: join(d.note) }),
    glance: (items) =>
      items.length
        ? {
            value: items.length > 1 ? `${items.length} soins` : "santé",
            spoken: "santé",
          }
        : null,
    renderLine: (item) => <span>{fr((item.data as HealthData).note)}</span>,
  },
];

const BY_TYPE = new Map(ITEM_KINDS.map((k) => [k.type, k]));

/** Le descripteur d'un type de moment. */
export function itemKind(type: ItemType): ItemKind {
  return BY_TYPE.get(type) ?? ITEM_KINDS[0];
}

/** Les types proposés à l'ajout, dans l'ordre d'une journée. */
export const ITEM_TYPES_IN_ORDER: ItemType[] = ITEM_KINDS.map((k) => k.type);
