import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  date,
  integer,
  jsonb,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/*  Better Auth (schéma par défaut — ne pas renommer les colonnes)            */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updatedAt")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt").$defaultFn(() => new Date()),
});

/* -------------------------------------------------------------------------- */
/*  Domaine Racontine                                                          */
/* -------------------------------------------------------------------------- */

/** Où la journée a été passée — sert de dimension à l'entrée. */
export const entrySource = pgEnum("entry_source", [
  "nounou",
  "mam",
  "creche",
  "maison",
]);

/**
 * Cycle de vie d'une entrée :
 *  processing → upload reçu, extraction VLM en cours
 *  draft      → extraite, en attente de relecture humaine
 *  published  → validée par un parent, visible dans le journal
 *  failed     → photo illisible ou erreur VLM (voir failureReason)
 */
export const entryStatus = pgEnum("entry_status", [
  "processing",
  "draft",
  "published",
  "failed",
]);

/** Types d'items structurés — typés pour les graphiques de la Phase 3. */
export const entryItemType = pgEnum("entry_item_type", [
  "meal",
  "nap",
  "activity",
  "anecdote",
  "health",
]);

export const attachmentKind = pgEnum("attachment_kind", [
  "carnet", // photo d'une page du carnet
  "souvenir", // photo souvenir libre
]);

export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  birthdate: date("birthdate"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    source: entrySource("source").notNull().default("nounou"),
    status: entryStatus("status").notNull().default("processing"),
    failureReason: text("failure_reason"),
    mood: text("mood"),
    /** transcription_integrale du carnet. */
    transcription: text("transcription"),
    /** Champs signalés incertains par le VLM (surlignés à la relecture). */
    uncertainties: jsonb("uncertainties").$type<string[]>().default([]),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
  },
  (t) => [
    // Deux photos de la même page → une seule entrée, fusionnée à la relecture.
    unique("entries_child_date_source").on(t.childId, t.date, t.source),
    index("entries_timeline_idx").on(t.childId, t.date),
  ],
);

export type MealData = { moment: string; contenu: string; appetit?: string };
export type NapData = { debut?: string; fin?: string; note?: string };
export type ActivityData = { label: string };
export type AnecdoteData = { text: string };
export type HealthData = { note: string };
export type EntryItemData =
  | MealData
  | NapData
  | ActivityData
  | AnecdoteData
  | HealthData;

export const entryItems = pgTable(
  "entry_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    type: entryItemType("type").notNull(),
    data: jsonb("data").$type<EntryItemData>().notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("entry_items_entry_idx").on(t.entryId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    kind: attachmentKind("kind").notNull().default("carnet"),
    /** Chemins relatifs à UPLOADS_DIR. */
    originalPath: text("original_path").notNull(),
    thumbPath: text("thumb_path"),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("attachments_entry_idx").on(t.entryId)],
);

/* ----------------------------------- Relations --------------------------- */

export const childrenRelations = relations(children, ({ many }) => ({
  entries: many(entries),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  child: one(children, {
    fields: [entries.childId],
    references: [children.id],
  }),
  items: many(entryItems),
  attachments: many(attachments),
}));

export const entryItemsRelations = relations(entryItems, ({ one }) => ({
  entry: one(entries, {
    fields: [entryItems.entryId],
    references: [entries.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  entry: one(entries, {
    fields: [attachments.entryId],
    references: [entries.id],
  }),
}));

export type Entry = typeof entries.$inferSelect;
export type EntryItem = typeof entryItems.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Child = typeof children.$inferSelect;
