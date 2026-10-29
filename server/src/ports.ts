import type { Readable } from "node:stream";
import type { Entry, Uncertainty } from "./db/schema.js";
import type { CarnetDay } from "./domain/carnet.js";
import type { ItemRow } from "./domain/entry-items.js";
import type { Source } from "./domain/entry-metadata.js";
import type { MemberRole } from "./db/schema.js";
import type { CarnetStanding, ErasureSnapshot } from "./domain/erasure.js";

export type StoredImage = {
  originalPath: string;
  thumbPath: string;
  mime: string;
  width: number;
  height: number;
};

export interface ImageStore {
  store(input: Buffer): Promise<StoredImage>;
  read(relPath: string): Promise<Buffer>;
  exists(relPath: string): Promise<boolean>;
  openRead(relPath: string): Readable;
  delete(img: { originalPath: string; thumbPath: string }): Promise<void>;
  rotate(
    img: { originalPath: string; thumbPath: string | null },
    quarters: number,
  ): Promise<{ width: number; height: number }>;
}

export type GlossaryEntry = { original: string; corrected: string };

export interface CarnetReader {
  read(
    pages: Buffer[],
    apiKey: string,
    glossary: GlossaryEntry[],
  ): Promise<CarnetDay[]>;
}

export interface ApiKeyStore {
  getKey(userId: string): Promise<string | null>;
}

export interface GlossaryStore {
  forChild(childId: string): Promise<GlossaryEntry[]>;
}

export interface AccessPolicy {
  accessibleChildIds(userId: string): Promise<string[]>;
  hasChildRole(userId: string, childId: string, min: MemberRole): Promise<boolean>;
  roleOn(userId: string, childId: string): Promise<MemberRole | null>;
}

export interface Paywall {
  blockedReason(): Promise<string | null>;
}

export interface PublicationNotifier {
  entryPublished(params: {
    entryId: string;
    childId: string;
    childName: string;
    date: string;
    actorUserId?: string | null;
  }): Promise<void>;
}

export interface BackgroundRunner {
  run(label: string, task: () => Promise<void>): void;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export type EntryContent = {
  mood: string | null;
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  uncertainties: Uncertainty[];
};

export type EntryRecord = Entry;

export type NewEntry = {
  childId: string;
  date: string;
  source: Source;
  status: "processing" | "draft" | "published";
  createdBy: string;
  batchId?: string | null;
  publishedAt?: Date | null;
} & Partial<EntryContent>;

export interface EntryRepository {
  findById(entryId: string): Promise<EntryRecord | null>;
  findByDay(
    childId: string,
    date: string,
    source: Source,
  ): Promise<EntryRecord | null>;
  createIfAbsent(entry: NewEntry): Promise<EntryRecord | null>;
  createWithItems(
    entry: NewEntry,
    items: ItemRow[],
  ): Promise<EntryRecord | null>;
  markProcessingUnlessPublished(entryId: string): Promise<boolean>;
  applyReadingIfProcessing(
    entryId: string,
    patch: EntryContent & { date?: string; batchId?: string | null },
    items: ItemRow[],
  ): Promise<boolean>;
  replaceReading(
    entryId: string,
    patch: EntryContent & { batchId?: string | null },
    items: ItemRow[],
  ): Promise<void>;
  failIfProcessing(entryId: string, reason: string): Promise<boolean>;
  claimFailedForRetry(entryId: string): Promise<boolean>;
  reclaimProcessing(reason: string): Promise<number>;
  appendUncertainty(entryId: string, uncertainty: Uncertainty): Promise<void>;
}

export interface AttachmentRepository {
  pathsFor(entryId: string): Promise<string[]>;
  idsFor(entryId: string): Promise<string[]>;
  nextPosition(entryId: string): Promise<number>;
  addMany(
    entryId: string,
    images: StoredImage[],
    startPosition: number,
  ): Promise<void>;
  moveTo(attachmentIds: string[], targetEntryId: string): Promise<void>;
}

export type EntryRevision = Partial<{
  mood: string | null;
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  source: Source;
  date: string;
  uncertainties: Uncertainty[];
}>;

export type RecordedCorrection = {
  childId: string;
  original: string;
  corrected: string;
  field: Uncertainty["champ"];
  entryId: string;
  createdBy: string;
};

export interface EntryRevisionRepository {
  revise(
    entryId: string,
    patch: EntryRevision,
    items: ItemRow[] | null,
    publish: boolean,
  ): Promise<{ firstPublish: boolean }>;
  saveResolvedReading(
    entryId: string,
    patch: EntryRevision,
    correction: RecordedCorrection,
  ): Promise<void>;
  remove(
    entryId: string,
  ): Promise<{ originalPath: string; thumbPath: string | null }[]>;
}

export interface ChildRepository {
  createWithOwner(params: {
    name: string;
    birthdate: string | null;
    ownerUserId: string;
  }): Promise<{ id: string; name: string; birthdate: string | null; createdAt: Date }>;
}

export type PageRecord = {
  id: string;
  entryId: string;
  originalPath: string;
  thumbPath: string | null;
  mime: string;
  rotation: number;
  width: number | null;
  height: number | null;
  childId: string;
  entryStatus: string;
};

export interface PageRepository {
  findWithEntry(attachmentId: string): Promise<PageRecord | null>;
  countSiblings(entryId: string): Promise<number>;
  saveRotation(
    attachmentId: string,
    size: { width: number; height: number; rotation: number },
  ): Promise<void>;
  remove(attachmentId: string): Promise<void>;
}

export interface ChildDirectory {
  nameOf(childId: string): Promise<string | null>;
}

export type StoredFile = { originalPath: string; thumbPath: string | null };

export type ExportedPage = {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
  url: string;
  file: string | null;
};

export type ExportedEntry = {
  id: string;
  date: string;
  source: string;
  status: string;
  mood: string | null;
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  uncertainties: Uncertainty[];
  createdAt: string;
  publishedAt: string | null;
  items: { type: string; data: unknown; position: number }[];
  pages: ExportedPage[];
};

export type ExportedCarnet = {
  id: string;
  name: string;
  birthdate: string | null;
  role: MemberRole;
  since: string;
  subscription: { emailEnabled: boolean } | null;
  entries: ExportedEntry[];
  corrections: {
    original: string;
    corrected: string;
    field: string | null;
    at: string;
  }[];
};

export type ExportArchive = {
  format: "racontine.export.v1";
  exportedAt: string;
  account: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    isOwner: boolean;
  };
  carnets: ExportedCarnet[];
  notifications: {
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
    readAt: string | null;
  }[];
  mcpTokens: {
    name: string;
    prefix: string;
    lastUsedAt: string | null;
    createdAt: string;
  }[];
  llmKey: { configured: boolean; hint: string | null };
  pushDevices: number;
};

export interface PrivacyRepository {
  exportFor(userId: string): Promise<ExportArchive | null>;
  erasureSnapshot(userId: string): Promise<ErasureSnapshot | null>;
  standingOn(userId: string, childId: string): Promise<CarnetStanding | null>;
  pageFilesOf(pageIds: string[]): Promise<{ id: string; originalPath: string }[]>;
  filesOfChildren(childIds: string[]): Promise<StoredFile[]>;
  stagedFilesOf(userId: string): Promise<StoredFile[]>;
  deleteChildren(childIds: string[]): Promise<void>;
  deleteAccount(userId: string): Promise<boolean>;
}

export type ArchiveEntry =
  | { path: string; data: Buffer }
  | { path: string; open: () => Readable };

export interface ArchivePacker {
  pack(entries: ArchiveEntry[]): Readable;
}
