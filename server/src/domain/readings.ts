import type { Uncertainty } from "../db/schema.js";

export type ValorizedFields = {
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
};

export function applyResolvedReading(
  fields: ValorizedFields,
  original: string,
  value: string,
): Partial<ValorizedFields> {
  const patch: Partial<ValorizedFields> = {};
  if (!original) return patch;
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

export function resolveUncertaintyAt(
  uncertainties: readonly Uncertainty[],
  index: number,
  value: string,
): Uncertainty[] {
  return uncertainties.map((u, i) => (i === index ? { ...u, resolved: value } : u));
}
