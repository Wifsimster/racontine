import { desc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { wordCorrections, type UncertaintyField } from "./db/schema.js";

export type GlossaryEntry = { original: string; corrected: string };

/**
 * Vocabulaire déjà validé pour un enfant — le plus récent en premier,
 * dédupliqué par mot original (insensible à la casse). Réinjecté au VLM à la
 * prochaine lecture (voir `vlm.ts`) pour que les mots déjà confirmés (surnoms,
 * mots d'enfant, écriture d'un intervenant donné…) soient reconnus sans
 * repasser par une relecture humaine.
 */
export async function getChildGlossary(
  childId: string,
  limit = 30,
): Promise<GlossaryEntry[]> {
  const rows = await db
    .select({
      original: wordCorrections.original,
      corrected: wordCorrections.corrected,
    })
    .from(wordCorrections)
    .where(eq(wordCorrections.childId, childId))
    .orderBy(desc(wordCorrections.createdAt))
    .limit(200);

  const seen = new Set<string>();
  const out: GlossaryEntry[] = [];
  for (const r of rows) {
    const key = r.original.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Enregistre une correction validée par un proche lors de la relecture d'une
 * incertitude — alimente le glossaire de l'enfant pour les lectures futures.
 */
export async function recordCorrection(row: {
  childId: string;
  original: string;
  corrected: string;
  field: UncertaintyField | null;
  entryId: string;
  createdBy: string;
}) {
  await db.insert(wordCorrections).values({
    childId: row.childId,
    original: row.original,
    corrected: row.corrected,
    field: row.field,
    entryId: row.entryId,
    createdBy: row.createdBy,
  });
}
