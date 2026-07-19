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

/**
 * Rôle d'un utilisateur sur un enfant — portée par enfant (§3.4 du plan produit).
 *  admin       → parent pivot : tout, y compris inviter/révoquer.
 *  contributor → co-parent : photographie, relit, publie.
 *  reader      → proche : consulte le journal publié, rien d'autre.
 */
export const memberRole = pgEnum("member_role", [
  "admin",
  "contributor",
  "reader",
]);

/** Cycle de vie d'une invitation à rejoindre le cercle d'un enfant. */
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
]);

/** Type de notification — extensible (jalons, invitations… en Phase 3). */
export const notificationType = pgEnum("notification_type", [
  "entry_published", // une nouvelle journée est publiée sur la timeline suivie
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
    /* --- Valorisation automatique de la journée (généré par le VLM) --- */
    /** Titre court et évocateur de la journée. */
    title: text("title"),
    /** Récit chaleureux de la journée, destiné aux proches. */
    story: text("story"),
    /** Le temps fort du jour (première fois, mot rigolo…). */
    highlight: text("highlight"),
    /** transcription_integrale du carnet. */
    transcription: text("transcription"),
    /** Champs signalés incertains par le VLM (surlignés à la relecture). */
    uncertainties: jsonb("uncertainties").$type<string[]>().default([]),
    /**
     * Identifiant partagé par les journées issues d'un même envoi de photos
     * (le carnet couvrait plusieurs jours). Null pour une journée seule.
     * Pas de clé étrangère : ce n'est pas l'id d'une entrée mais un simple
     * repère de lot, pour ne pas coupler la suppression d'une journée aux
     * autres journées du même lot.
     */
    batchId: uuid("batch_id"),
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

/**
 * Qui a accès à quel enfant, et avec quel rôle. Un même utilisateur peut suivre
 * plusieurs enfants ; un même enfant peut être partagé avec plusieurs proches.
 */
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
    // Un seul rôle par (utilisateur, enfant).
    unique("memberships_user_child").on(t.userId, t.childId),
    index("memberships_user_idx").on(t.userId),
    index("memberships_child_idx").on(t.childId),
  ],
);

/**
 * Invitation d'un proche à rejoindre le cercle d'un enfant. Le `token` est la
 * capacité : quiconque le détient et se connecte peut accepter. Lien partagé
 * par l'admin (copié depuis l'UI) ou envoyé par magic link.
 */
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

/**
 * Abonnement d'un proche à la timeline d'un enfant : chaque publication d'une
 * journée déclenche une notification in-app + un e-mail à tous les abonnés.
 */
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
    /** L'abonné reçoit aussi un e-mail (en plus de la notif in-app). */
    emailEnabled: boolean("email_enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Un seul abonnement par (proche, enfant).
    unique("subscriptions_user_child").on(t.userId, t.childId),
    index("subscriptions_child_idx").on(t.childId),
  ],
);

/** Notification in-app pour un abonné (cloche + liste des non-lues). */
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
    /** Null tant que la notification n'a pas été lue. */
    readAt: timestamp("read_at"),
    /** Horodatage de l'envoi de l'e-mail (null si non/pas encore envoyé). */
    emailedAt: timestamp("emailed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Réglages de l'instance, modifiables à chaud par le propriétaire depuis l'UI
 * (sans redéploiement ni édition de variables d'environnement). Table singleton :
 * une seule ligne, `id = "singleton"`. Une colonne à `null` retombe sur le défaut
 * d'environnement (config.ts) — voir `settings.ts`.
 */
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("singleton"),
  /** Nom d'affichage de l'instance (en-tête, écran de connexion). */
  appName: text("app_name"),
  /** Inscription email/mot de passe ouverte (fermer une fois le foyer créé). */
  signupEnabled: boolean("signup_enabled"),
  /** Durée de validité d'une invitation (jours). */
  invitationTtlDays: integer("invitation_ttl_days"),
  /** Modèle VLM utilisé pour l'extraction des carnets. */
  vlmModel: text("vlm_model"),
  /** Envoi global des e-mails de notification aux abonnés (in-app toujours actif). */
  emailNotificationsEnabled: boolean("email_notifications_enabled"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  /** Dernier propriétaire ayant modifié les réglages. */
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});

/**
 * Jeton d'accès personnel pour connecter un client MCP (session Claude cloud,
 * Claude Desktop, Claude Code…) au serveur. Le jeton porte les droits de
 * l'utilisateur qui l'a créé (mêmes rôles par enfant). On ne stocke que le
 * hash SHA-256 : la valeur en clair n'est montrée qu'une fois, à la création.
 */
export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Libellé lisible choisi par l'utilisateur (ex. « Session Claude cloud »). */
    name: text("name").notNull(),
    /** SHA-256 (hex) du jeton — jamais la valeur en clair. */
    tokenHash: text("token_hash").notNull().unique(),
    /** Préfixe lisible pour identifier le jeton dans l'UI (ex. « rac_mcp_ab12 »). */
    tokenPrefix: text("token_prefix").notNull(),
    /** Dernière utilisation du jeton (null tant qu'il n'a jamais servi). */
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("mcp_tokens_user_idx").on(t.userId)],
);

/**
 * Fichier brut mis en attente par un client MCP avant création de la journée.
 * Résout le problème du base64 inline : un client shell téléverse les octets
 * bruts d'une photo via `POST /api/mcp/uploads` (aucun base64 à faire transiter
 * par les arguments d'outil), récupère un `id` court, puis appelle
 * `upload_daily_note` avec cet identifiant. Le fichier vit sous
 * `UPLOADS_DIR/staging/…` et est supprimé après ingestion (ou à l'expiration).
 */
export const mcpUploads = pgTable(
  "mcp_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Chemin relatif à UPLOADS_DIR du fichier brut mis en attente. */
    path: text("path").notNull(),
    /** Taille du fichier brut (octets) — indice d'affichage / diagnostic. */
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Au-delà, l'upload est considéré périmé et balayé (fichier + ligne). */
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [
    index("mcp_uploads_user_idx").on(t.userId),
    index("mcp_uploads_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Réglages LLM propres à chaque utilisateur. Chaque contributeur apporte SA
 * propre clé API Anthropic (facturation individuelle, pas de clé partagée
 * d'instance). La clé n'est jamais stockée en clair : on conserve un blob
 * chiffré (AES-256-GCM, voir crypto.ts) et un indice non sensible (4 derniers
 * caractères) pour l'affichage. Une ligne par utilisateur.
 */
export const userLlmSettings = pgTable("user_llm_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Clé API Anthropic chiffrée (AES-256-GCM), ou null si non configurée. */
  anthropicKeyEnc: text("anthropic_key_enc"),
  /** Indice d'affichage : les 4 derniers caractères de la clé (jamais la clé). */
  anthropicKeyHint: text("anthropic_key_hint"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ----------------------------------- Relations --------------------------- */

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
