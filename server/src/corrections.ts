import { desc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { wordCorrections, type UncertaintyField } from "./db/schema.js";

export type GlossaryEntry = { original: string; corrected: string };

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
