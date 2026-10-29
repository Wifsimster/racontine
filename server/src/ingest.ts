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

export function ingestCarnetImages(input: IngestInput): Promise<IngestResult> {
  return ingestService.ingest(input);
}

export function createTranscribedEntry(
  input: CreateNoteInput,
): Promise<CreateNoteResult> {
  return transcribedNotes.create(input);
}

export function reclaimStuckEntries(): Promise<number> {
  return carnetReading.reclaimStuck();
}
