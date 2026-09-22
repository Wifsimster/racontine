import type { Uncertainty } from "../db/schema.js";

/** Les champs de la valorisation où un mot lu peut apparaître. */
export type ValorizedFields = {
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
};

/**
 * Applique une lecture tranchée : le mot douteux est remplacé par la valeur
 * choisie PARTOUT où il apparaît réellement dans la valorisation.
 *
 * Le champ signalé par le modèle (`champ`) est indicatif et souvent imprécis —
 * on ne s'y fie pas pour décider où remplacer. Seuls les champs réellement
 * touchés sont renvoyés : un `UPDATE` ne réécrit ainsi que ce qui change.
 */
export function applyResolvedReading(
  fields: ValorizedFields,
  original: string,
  value: string,
): Partial<ValorizedFields> {
  const patch: Partial<ValorizedFields> = {};
  if (!original) return patch;
  // Le mot ENTIER seulement : trancher « mis » en « mit » ne doit pas changer
  // « mise » en « mite » ailleurs dans le récit — un texte qui part chez les
  // proches. Une lettre ou un chiffre collé au mot fait de lui un autre mot.
  const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const whole = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  for (const key of [
    "title",
    "story",
    "highlight",
    "transcription",
  ] as const) {
    const current = fields[key];
    if (!current) continue;
    const next = current.replace(whole, () => value);
    if (next !== current) patch[key] = next;
  }
  return patch;
}

/** Marque l'incertitude `index` comme tranchée, sans toucher aux autres. */
export function resolveUncertaintyAt(
  uncertainties: readonly Uncertainty[],
  index: number,
  value: string,
): Uncertainty[] {
  return uncertainties.map((u, i) => (i === index ? { ...u, resolved: value } : u));
}
