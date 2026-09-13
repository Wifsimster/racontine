/**
 * FAÇADE D'INGESTION — la porte d'entrée historique, désormais sans logique.
 *
 * Ce fichier portait 900 lignes : validation, stockage disque, SQL, appels au
 * modèle vision, découpage d'un carnet en journées, notification des abonnés.
 * Une seule raison de changer ? Il en avait six. Tout cela vit maintenant dans
 * `domain/` (règles pures), `services/` (orchestration) et `adapters/`
 * (technique) ; il ne reste ici que le branchement sur la racine de composition
 * et les ré-exports qui gardent les appelants — routes web, outils MCP, tests —
 * à l'abri du déménagement.
 */
import { carnetReading, ingestService, transcribedNotes } from "./composition.js";

export { DATE_RE, todayIso } from "./domain/dates.js";
export { SOURCES, type Source } from "./domain/entry-metadata.js";
export { ITEM_TYPES, type ItemType } from "./domain/entry-items.js";
export type { TranscribedNote } from "./domain/carnet.js";
export type {
  IngestInput,
  IngestResult,
} from "./services/ingest-service.js";
export type {
  CreateNoteInput,
  CreateNoteResult,
} from "./services/transcribed-note-service.js";

import type {
  IngestInput,
  IngestResult,
} from "./services/ingest-service.js";
import type {
  CreateNoteInput,
  CreateNoteResult,
} from "./services/transcribed-note-service.js";

/** Cœur partagé de l'ingestion d'une journée (route HTTP multipart *et* outil MCP). */
export function ingestCarnetImages(input: IngestInput): Promise<IngestResult> {
  return ingestService.ingest(input);
}

/** Crée une journée à partir d'un contenu déjà transcrit (sans photo ni VLM). */
export function createTranscribedEntry(
  input: CreateNoteInput,
): Promise<CreateNoteResult> {
  return transcribedNotes.create(input);
}

/** Récupère au démarrage les journées dont la lecture est morte avec le processus. */
export function reclaimStuckEntries(): Promise<number> {
  return carnetReading.reclaimStuck();
}
