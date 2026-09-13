import { AnthropicCarnetReader } from "./adapters/anthropic-carnet-reader.js";
import {
  CorrectionsGlossaryStore,
  DrizzleChildDirectory,
  EncryptedApiKeyStore,
  MembershipAccessPolicy,
} from "./adapters/db-stores.js";
import {
  DrizzleAttachmentRepository,
  DrizzleChildRepository,
  DrizzleEntryRepository,
  DrizzleEntryRevisionRepository,
} from "./adapters/drizzle-entry-repository.js";
import { FileSystemImageStore } from "./adapters/fs-image-store.js";
import { ConsoleLogger, FireAndForgetRunner } from "./adapters/runtime.js";
import { config } from "./config.js";
import {
  DrizzleNotificationLog,
  DrizzleSubscriberDirectory,
} from "./notifications/drizzle-stores.js";
import { EmailChannel } from "./notifications/email-channel.js";
import { WebPushChannel } from "./notifications/push-channel.js";
import { SubscriberNotifier } from "./notifications/subscriber-notifier.js";
import { DrizzleEntryQueries } from "./mcp/queries.js";
import { DbStagedUploads } from "./mcp/uploads.js";
import { CarnetReadingService } from "./services/carnet-reading-service.js";
import { EntryEditingService } from "./services/entry-editing-service.js";
import { IngestService } from "./services/ingest-service.js";
import { TranscribedNoteService } from "./services/transcribed-note-service.js";

/* ===========================================================================
   LA RACINE DE COMPOSITION — le SEUL endroit qui sait qui est branché sur quoi.

   Ailleurs, plus personne ne choisit son fournisseur : les services reçoivent
   des ports, les adaptateurs implémentent ces ports, et c'est ici — et
   seulement ici — que les deux se rencontrent. Changer de stockage d'images, de
   moteur de lecture ou de base de données se fait en changeant une ligne de ce
   fichier, sans ouvrir un seul service.
   =========================================================================== */

const logger = new ConsoleLogger();
const background = new FireAndForgetRunner(logger);
const entries = new DrizzleEntryRepository();
const revisions = new DrizzleEntryRevisionRepository();
const attachments = new DrizzleAttachmentRepository();
const images = new FileSystemImageStore();
const access = new MembershipAccessPolicy();
const apiKeys = new EncryptedApiKeyStore();
const children = new DrizzleChildDirectory();
/**
 * Les canaux de notification, dans l'ordre où on les tente. UNE ligne par
 * moyen de joindre les proches : c'est ici, et nulle part ailleurs, qu'on en
 * ajoute un.
 */
export const subscriberNotifier = new SubscriberNotifier({
  subscribers: new DrizzleSubscriberDirectory(),
  log: new DrizzleNotificationLog(),
  channels: [new WebPushChannel(), new EmailChannel()],
  webBaseUrl: config.webBaseUrl,
  logger,
});

/** Lecture des carnets (modèle vision) en arrière-plan. */
export const carnetReading = new CarnetReadingService({
  entries,
  access,
  attachments,
  images,
  reader: new AnthropicCarnetReader(),
  apiKeys,
  glossary: new CorrectionsGlossaryStore(),
  background,
  logger,
});

/** Arrivée d'un carnet photographié (route web et outil MCP). */
export const ingestService = new IngestService({
  entries,
  attachments,
  images,
  apiKeys,
  access,
  reading: carnetReading,
});

/** Création d'un enfant et de son cercle. */
export const childRepository = new DrizzleChildRepository();

/** Relecture humaine : champs, moments, publication, lectures tranchées. */
export const entryEditing = new EntryEditingService({
  entries,
  revisions,
  access,
  children,
  notifier: subscriberNotifier,
  background,
});

/** Création d'une journée déjà transcrite (outil MCP). */
export const transcribedNotes = new TranscribedNoteService({
  entries,
  access,
  children,
  notifier: subscriberNotifier,
  background,
});

/**
 * Ce qu'un outil MCP reçoit, en plus de l'utilisateur de son jeton : les mêmes
 * services que les routes web (une seule règle métier, deux protocoles) et les
 * lectures dont ses outils ont besoin.
 */
export const mcpTooling = {
  ingest: ingestService,
  notes: transcribedNotes,
  queries: new DrizzleEntryQueries(),
  uploads: new DbStagedUploads(),
};
