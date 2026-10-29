import { isIsoDate, todayIso } from "./dates.js";

export const SOURCES = ["nounou", "mam", "creche", "maison"] as const;
export type Source = (typeof SOURCES)[number];

export function isSource(value: string): value is Source {
  return (SOURCES as readonly string[]).includes(value);
}

export type EntryMetadata = { date: string; source: Source };

export type MetadataResult =
  | { ok: true; value: EntryMetadata }
  | { ok: false; httpCode: number; error: string };

export function normalizeEntryMetadata(input: {
  date?: string;
  source?: string;
}): MetadataResult {
  let date = todayIso();
  if (input.date !== undefined) {
    if (!isIsoDate(input.date))
      return {
        ok: false,
        httpCode: 400,
        error: "date invalide (attendu AAAA-MM-JJ)",
      };
    date = input.date;
  }

  let source: Source = "nounou";
  if (input.source !== undefined) {
    if (!isSource(input.source))
      return {
        ok: false,
        httpCode: 400,
        error: "source invalide (nounou, mam, creche ou maison)",
      };
    source = input.source;
  }

  return { ok: true, value: { date, source } };
}
