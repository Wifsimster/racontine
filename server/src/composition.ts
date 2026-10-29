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
import {
  DrizzleInvitationRepository,
  DrizzleMembershipRepository,
  DrizzleUserDirectory,
  NotifyLinkDelivery,
} from "./adapters/drizzle-sharing.js";
import { DrizzleAdminRepository } from "./adapters/drizzle-admin.js";
import { DrizzlePageRepository } from "./adapters/drizzle-page-repository.js";
import { DrizzlePrivacyRepository } from "./adapters/drizzle-privacy.js";
import { FileSystemImageStore } from "./adapters/fs-image-store.js";
import { ZipArchivePacker } from "./adapters/zip-archive-packer.js";
import { ConsoleLogger, FireAndForgetRunner } from "./adapters/runtime.js";
import { randomBytes } from "node:crypto";
import { blockedReason } from "./billing/index.js";
import { config } from "./config.js";
import { getSettings } from "./settings.js";
import {
  DrizzleDayGlance,
  DrizzleNotificationLog,
  DrizzleSubscriberDirectory,
} from "./notifications/drizzle-stores.js";
import { EmailChannel } from "./notifications/email-channel.js";
import { WebPushChannel } from "./notifications/push-channel.js";
import { SubscriberNotifier } from "./notifications/subscriber-notifier.js";
import { requireChildAdminAccess } from "./access.js";
import { LiveInstanceOps } from "./instance-ops.js";
import { DrizzleOpsQueries } from "./mcp/ops-queries.js";
import { DrizzleEntryQueries } from "./mcp/queries.js";
import { DbStagedUploads } from "./mcp/uploads.js";
import { AdminService } from "./services/admin-service.js";
import { CarnetReadingService } from "./services/carnet-reading-service.js";
import { EntryEditingService } from "./services/entry-editing-service.js";
import { IngestService } from "./services/ingest-service.js";
import { ChildrenService } from "./services/children-service.js";
import { PageService } from "./services/page-service.js";
import { PrivacyService } from "./services/privacy-service.js";
import { SharingService } from "./services/sharing-service.js";
import { TranscribedNoteService } from "./services/transcribed-note-service.js";

const logger = new ConsoleLogger();
const background = new FireAndForgetRunner(logger);
const entries = new DrizzleEntryRepository();
const revisions = new DrizzleEntryRevisionRepository();
const attachments = new DrizzleAttachmentRepository();
const images = new FileSystemImageStore();
const access = new MembershipAccessPolicy();
const apiKeys = new EncryptedApiKeyStore();
const children = new DrizzleChildDirectory();
const paywall = { blockedReason };
export const subscriberNotifier = new SubscriberNotifier({
  subscribers: new DrizzleSubscriberDirectory(),
  log: new DrizzleNotificationLog(),
  channels: [new WebPushChannel(), new EmailChannel(new DrizzleDayGlance())],
  webBaseUrl: config.webBaseUrl,
  logger,
});

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

export const ingestService = new IngestService({
  entries,
  attachments,
  images,
  apiKeys,
  access,
  paywall,
  reading: carnetReading,
});

export const childrenService = new ChildrenService(new DrizzleChildRepository());

export const entryEditing = new EntryEditingService({
  entries,
  revisions,
  access,
  children,
  notifier: subscriberNotifier,
  background,
  images,
  logger,
});

export const pages = new PageService({
  pages: new DrizzlePageRepository(),
  images,
  access,
  logger,
});

export const privacy = new PrivacyService({
  privacy: new DrizzlePrivacyRepository(),
  images,
  packer: new ZipArchivePacker(),
  logger,
});

export const transcribedNotes = new TranscribedNoteService({
  entries,
  access,
  children,
  paywall,
  notifier: subscriberNotifier,
  background,
});

export const adminConsole = new AdminService(new DrizzleAdminRepository());

export const sharing = new SharingService({
  memberships: new DrizzleMembershipRepository(),
  invitations: new DrizzleInvitationRepository(),
  users: new DrizzleUserDirectory(),
  delivery: new NotifyLinkDelivery(),
  invitationTtlDays: async () => (await getSettings()).invitationTtlDays,
  inviteUrl: (token) => `${config.webBaseUrl}/invite/${token}`,
  newToken: () => randomBytes(24).toString("base64url"),
  now: () => new Date(),
});

export const mcpTooling = {
  ingest: ingestService,
  notes: transcribedNotes,
  queries: new DrizzleEntryQueries(),
  uploads: new DbStagedUploads(),
  admin: adminConsole,
  editing: entryEditing,
  reading: carnetReading,
  instance: new LiveInstanceOps(),
  ops: new DrizzleOpsQueries(),
  sharing,
  circleAccess: { requireAdmin: requireChildAdminAccess },
};
