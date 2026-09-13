import { Baby, Moon, Smile, Soup, Sparkles } from "lucide-react";
/* Le VOCABULAIRE de la capture : une prise, les deux temps de l'envoi, et
   les quelques mises en forme qu'ils partagent. */

/** Espace insécable : « 1,4 Mo », « 2 pages » — typographie française. */
export const NBSP = " ";

/** `id` référence l'enregistrement persisté ; `file` sert à l'envoi. */
export type Shot = { id: string; file: File; url: string };

/** Où en est l'envoi. `prep` est mesurable, `upload` ne l'est pas — on le dit. */
export type Stage = "prep" | "upload";

export type Phase = "idle" | "sending" | "error";

/**
 * Part de la barre de progression réservée à la préparation des pages.
 * Le reste (45 %) est l'envoi : `fetch` ne rapporte aucune progression, donc
 * ce segment est un balayage DÉCLARÉ (la boucle de 1200 ms de `.skeleton`) et
 * non un pourcentage inventé qui grimpe tout seul.
 */
export const PREP_SHARE = 55;

/** La forme de la réponse qui arrive : ce que Racontine cherche sur la page. */
export const MOMENT_SHAPES = [
  { key: "meal", label: "Repas", Icon: Soup, width: "w-3/4" },
  { key: "nap", label: "Sieste", Icon: Moon, width: "w-1/2" },
  { key: "mood", label: "Humeur", Icon: Smile, width: "w-2/3" },
  { key: "activity", label: "Activité", Icon: Sparkles, width: "w-4/5" },
  { key: "anecdote", label: "Anecdote", Icon: Baby, width: "w-3/5" },
] as const;

/** Date locale du téléphone au format AAAA-MM-JJ (le carnet est photographié le soir). */
export function localDate(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** « 840 Ko », « 1,4 Mo » — virgule décimale et espace insécable. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}${NBSP}o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}${NBSP}Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")}${NBSP}Mo`;
}

export function pageCount(n: number): string {
  return `${n}${NBSP}page${n > 1 ? "s" : ""}`;
}

/* --------------------------------------------------------------------------
   Un conseil de prise de vue : la même ligne que sur le journal (tuile de
   28 px, encre pâlie), pour que les deux écrans se ressemblent.
   -------------------------------------------------------------------------- */

