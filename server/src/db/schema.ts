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

export const entrySource = pgEnum("entry_source", [
  "nounou",
  "mam",
  "creche",
  "maison",
]);

export const entryStatus = pgEnum("entry_status", [
  "processing",
  "draft",
  "published",
  "failed",
]);

export const entryItemType = pgEnum("entry_item_type", [
  "meal",
  "nap",
  "activity",
  "anecdote",
  "health",
]);

export const attachmentKind = pgEnum("attachment_kind", [
  "carnet",
  "souvenir",
]);

export type UncertaintyField =
  | "titre"
  | "recit"
  | "temps_fort"
  | "transcription_integrale";

export type Uncertainty = {
  original: string;
  contexte: string;
  suggestions: string[];
  champ: UncertaintyField | null;
  resolved: string | null;
};

export const memberRole = pgEnum("member_role", [
  "admin",
  "contributor",
  "reader",
]);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
]);

export const notificationType = pgEnum("notification_type", [
  "entry_published",
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
    title: text("title"),
    story: text("story"),
    highlight: text("highlight"),
    transcription: text("transcription"),
    uncertainties: jsonb("uncertainties").$type<Uncertainty[]>().default([]),
    batchId: uuid("batch_id"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
  },
  (t) => [
    unique("entries_child_date_source").on(t.childId, t.date, t.source),
    index("entries_timeline_idx").on(t.childId, t.date),
    index("entries_batch_idx").on(t.batchId),
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

export const wordCorrections = pgTable(
  "word_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    original: text("original").notNull(),
    corrected: text("corrected").notNull(),
    field: text("field"),
    entryId: uuid("entry_id").references(() => entries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("word_corrections_child_idx").on(t.childId, t.createdAt)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    kind: attachmentKind("kind").notNull().default("carnet"),
    originalPath: text("original_path").notNull(),
    thumbPath: text("thumb_path"),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    rotation: integer("rotation").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("attachments_entry_idx").on(t.entryId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("reader"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("memberships_user_child").on(t.userId, t.childId),
    index("memberships_user_idx").on(t.userId),
    index("memberships_child_idx").on(t.childId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").notNull().default("reader"),
    token: text("token").notNull().unique(),
    status: invitationStatus("status").notNull().default("pending"),
    invitedBy: text("invited_by").references(() => user.id, {
      onDelete: "set null",
    }),
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("invitations_child_idx").on(t.childId),
    index("invitations_email_idx").on(t.email),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("subscriptions_user_child").on(t.userId, t.childId),
    index("subscriptions_child_idx").on(t.childId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    childId: uuid("child_id").references(() => children.id, {
      onDelete: "cascade",
    }),
    entryId: uuid("entry_id").references(() => entries.id, {
      onDelete: "cascade",
    }),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at"),
    emailedAt: timestamp("emailed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("singleton"),
  appName: text("app_name"),
  signupEnabled: boolean("signup_enabled"),
  invitationTtlDays: integer("invitation_ttl_days"),
  vlmModel: text("vlm_model"),
  emailNotificationsEnabled: boolean("email_notifications_enabled"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});

export const instanceSubscription = pgTable("instance_subscription", {
  id: text("id").primaryKey().default("singleton"),
  trialEndsAt: timestamp("trial_ends_at").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  lastEventAt: timestamp("last_event_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("mcp_tokens_user_idx").on(t.userId)],
);

export const mcpUploads = pgTable(
  "mcp_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [
    index("mcp_uploads_user_idx").on(t.userId),
    index("mcp_uploads_expires_idx").on(t.expiresAt),
  ],
);

export const userLlmSettings = pgTable("user_llm_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  anthropicKeyEnc: text("anthropic_key_enc"),
  anthropicKeyHint: text("anthropic_key_hint"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const childrenRelations = relations(children, ({ many }) => ({
  entries: many(entries),
  memberships: many(memberships),
  invitations: many(invitations),
  subscriptions: many(subscriptions),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  child: one(children, {
    fields: [memberships.childId],
    references: [children.id],
  }),
  user: one(user, {
    fields: [memberships.userId],
    references: [user.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  child: one(children, {
    fields: [invitations.childId],
    references: [children.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  child: one(children, {
    fields: [subscriptions.childId],
    references: [children.id],
  }),
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  child: one(children, {
    fields: [notifications.childId],
    references: [children.id],
  }),
  entry: one(entries, {
    fields: [notifications.entryId],
    references: [entries.id],
  }),
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
export type EntryStatus = (typeof entryStatus.enumValues)[number];
export type EntryItem = typeof entryItems.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Child = typeof children.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
export type Subscription = typeof subscriptions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type McpToken = typeof mcpTokens.$inferSelect;
export type McpUpload = typeof mcpUploads.$inferSelect;
export type UserLlmSettings = typeof userLlmSettings.$inferSelect;
export type InstanceSubscription = typeof instanceSubscription.$inferSelect;
export type WordCorrection = typeof wordCorrections.$inferSelect;
