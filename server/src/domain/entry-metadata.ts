import { isIsoDate, todayIso } from "./dates.js";

/** Où la journée a été passée — dimension de l'entrée (enfant + date + source). */
export const SOURCES = ["nounou", "mam", "creche", "maison"] as const;
export type Source = (typeof SOURCES)[number];

/** True si la chaîne est un lieu connu. */
export function isSource(value: string): value is Source {
  return (SOURCES as readonly string[]).includes(value);
}

/** Ce qui identifie une journée, une fois les défauts appliqués. */
export type EntryMetadata = { date: string; source: Source };

/** Métadonnées acceptées, ou refus portant déjà son code HTTP et sa phrase. */
export type MetadataResult =
  | { ok: true; value: EntryMetadata }
  | { ok: false; httpCode: number; error: string };

/**
 * Normalise les métadonnées d'une journée : date (défaut aujourd'hui) et lieu
 * (défaut nounou), tous deux refusés explicitement s'ils sont mal formés.
 *
 * La règle vivait en double — une fois dans l'ingestion de photos, une fois
 * dans la création d'une journée déjà transcrite —, avec les mêmes phrases
 * recopiées. Deux copies, c'est une divergence en attente : celle qui n'aurait
 * pas reçu un nouveau lieu aurait refusé ce que l'autre acceptait.
 */
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
