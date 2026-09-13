export type EntryStatus = "processing" | "draft" | "published" | "failed";
export type EntrySource = "nounou" | "mam" | "creche" | "maison";
export type ItemType = "meal" | "nap" | "activity" | "anecdote" | "health";

export type MealData = { moment: string; contenu: string; appetit?: string };
export type NapData = { debut?: string; fin?: string; note?: string };
export type ActivityData = { label: string };
export type AnecdoteData = { text: string };
export type HealthData = { note: string };

export type UncertaintyField =
  | "titre"
  | "recit"
  | "temps_fort"
  | "transcription_integrale";

/**
 * Mot ou passage dont la lecture manuscrite est incertaine, avec des
 * suggestions de correction à valider. `resolved` porte la valeur choisie une
 * fois la relecture faite (null tant que non validé).
 */
export type Uncertainty = {
  original: string;
  contexte: string;
  suggestions: string[];
  champ: UncertaintyField | null;
  resolved: string | null;
};

export type EntryItem = {
  id: string;
  type: ItemType;
  data: MealData | NapData | ActivityData | AnecdoteData | HealthData;
  position: number;
};

export type AttachmentRef = {
  id: string;
  url: string;
  thumbUrl: string;
  width?: number | null;
  height?: number | null;
};

export type MemberRole = "admin" | "contributor" | "reader";

export type Child = {
  id: string;
  name: string;
  birthdate: string | null;
  /** Rôle de l'utilisateur courant sur cet enfant. */
  role?: MemberRole;
};

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  expired: boolean;
  url: string;
};

export type InvitationPreview = {
  email: string;
  role: MemberRole;
  childName: string;
  status: "pending" | "accepted" | "revoked";
  expired: boolean;
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Administrateur",
  contributor: "Contributeur",
  reader: "Lecteur",
};

export const ROLE_HINTS: Record<MemberRole, string> = {
  admin: "Tout gérer, inviter et retirer des proches",
  contributor: "Photographier, relire et publier les journées",
  reader: "Consulter le journal publié",
};

export type Entry = {
  id: string;
  childId: string;
  child?: Child;
  date: string;
  source: EntrySource;
  status: EntryStatus;
  failureReason: string | null;
  mood: string | null;
  /** Valorisation automatique de la journée. */
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  uncertainties: Uncertainty[] | null;
  publishedAt: string | null;
  items: EntryItem[];
  attachments: AttachmentRef[];
  /**
   * Identifiant commun aux journées issues d'un même envoi de photos
   * couvrant plusieurs jours (carnet photographié sur plusieurs pages à la
   * fois). Null pour une journée seule.
   */
  batchId: string | null;
};

/**
 * Une page du fil. `nextCursor` est l'ancre de la suivante : l'identifiant de
 * la dernière journée rendue, et non un décalage — une journée publiée pendant
 * qu'on lit ne décale donc plus rien (cf. `domain/feed-window.ts` côté serveur).
 */
export type TimelinePage = {
  entries: Entry[];
  nextCursor: string | null;
};

/** Un mois du carnet et son nombre de journées, pour le saut de mois. */
export type JournalMonth = {
  /** AAAA-MM. */
  month: string;
  count: number;
};

/** Résumé léger d'une journée sœur dans un même lot (stepper de relecture). */
export type BatchEntrySummary = {
  id: string;
  date: string;
  status: EntryStatus;
  title: string | null;
};

export const SOURCE_LABELS: Record<EntrySource, string> = {
  nounou: "Nounou",
  mam: "MAM",
  creche: "Crèche",
  maison: "Maison",
};

export type SubscriptionStatus = {
  subscribed: boolean;
  emailEnabled: boolean;
};

export type Subscriber = {
  userId: string;
  name: string;
  email: string;
  emailEnabled: boolean;
  createdAt: string;
};

export type NotificationType = "entry_published";

export type Notification = {
  id: string;
  userId: string;
  childId: string | null;
  entryId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: string | null;
  emailedAt: string | null;
  createdAt: string;
};

export const ITEM_LABELS: Record<ItemType, string> = {
  meal: "Repas",
  nap: "Sieste",
  activity: "Activité",
  anecdote: "Anecdote",
  health: "Santé",
};

/* ------------------------------ Réglages ------------------------------- */

/** Utilisateur courant, et les portes qui s'ouvrent pour lui. */
export type Me = {
  id: string;
  email: string;
  name: string;
  /** Propriétaire de l'instance (premier compte) : accès aux réglages. */
  isOwner: boolean;
  /** Administrateur d'au moins un enfant : accès à la console d'administration. */
  isAdmin: boolean;
};

/** Réglages effectifs de l'instance, modifiables par le propriétaire. */
export type AppSettings = {
  appName: string;
  signupEnabled: boolean;
  invitationTtlDays: number;
  vlmModel: string;
  emailNotificationsEnabled: boolean;
};

/** État de l'infrastructure (piloté par l'environnement, en lecture seule). */
export type SettingsMeta = {
  mailConfigured: boolean;
  webPushConfigured: boolean;
  notifyWebhookConfigured: boolean;
  webBaseUrl: string;
  knownVlmModels: string[];
};

/**
 * État de la clé API LLM propre à l'utilisateur courant. La clé n'est jamais
 * renvoyée : seul un indice (4 derniers caractères) sert à la confirmation.
 */
export type UserLlm = {
  configured: boolean;
  hint: string | null;
};

export type SettingsResponse = {
  settings: AppSettings;
  meta: SettingsMeta;
};

/** Réglages publics, exposés sans authentification (écran de connexion). */
export type PublicSettings = {
  appName: string;
  signupEnabled: boolean;
};

/* --------------------------- Jetons MCP -------------------------------- */

/** Jeton d'accès MCP (sans le secret, jamais renvoyé après la création). */
export type McpToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

/** Réponse de création : le secret en clair n'est renvoyé qu'ici, une fois. */
export type CreatedMcpToken = {
  token: McpToken;
  secret: string;
};

/* ----------------------------- Abonnement ------------------------------ */

/** Pourquoi le carnet est ouvert, ou fermé (miroir de `domain/paywall.ts`). */
export type AccessReason =
  | "self-hosted"
  | "trial"
  | "subscribed"
  | "payment-late"
  | "trial-over"
  | "subscription-over";

/**
 * L'accès à l'ÉCRITURE du carnet. Lire n'est jamais concerné : le journal déjà
 * publié reste lisible quoi qu'il arrive, et aucun écran ne doit laisser penser
 * le contraire.
 */
export type CarnetAccess = {
  /** Peut-on commencer une NOUVELLE journée ? */
  open: boolean;
  reason: AccessReason;
  /** Jours entiers restants d'essai, ou null. */
  daysLeft: number | null;
  /** Date (ISO) jusqu'à laquelle l'accès est acquis, ou null. */
  until: string | null;
  /** Date (ISO) de fin d'un abonnement résilié, ou null. */
  endingAt: string | null;
};

/** Le tarif, tel que Stripe le détient — jamais recopié dans le front. */
export type PlanPrice = {
  /** Montant en centimes. */
  unitAmount: number;
  currency: string;
  /** « month », « year »… */
  interval: string;
  intervalCount: number;
};

/**
 * L'OFFRE TELLE QU'ON PEUT LA MONTRER SANS SESSION — ce que rend
 * `/api/billing/offer`, et tout ce dont l'écran d'accueil public a besoin.
 * Aucun état de foyer ici : ni accès, ni échéance, ni payeur.
 */
export type BillingOffer = {
  /** false sur une instance auto-hébergée : il n'y a pas de caisse. */
  enabled: boolean;
  price: PlanPrice | null;
  /** Durée de l'essai gratuit, en jours — annoncée avant de créer un compte. */
  trialDays: number;
};

export type Billing = {
  /** false sur une instance auto-hébergée : aucun péage, rien à afficher. */
  enabled: boolean;
  access: CarnetAccess;
  price: PlanPrice | null;
  /** L'appelant peut-il payer / gérer (propriétaire du foyer) ? */
  canManage: boolean;
  hasSubscription: boolean;
  /** Qui règle l'abonnement, pour les autres membres du foyer. */
  billedTo: { name: string; email: string } | null;
};

/* --------------------------- Administration ----------------------------- */

/** Un carnet administré, avec l'état de ses journées. */
export type AdminChildRow = {
  id: string;
  name: string;
  birthdate: string | null;
  members: number;
  entries: Record<EntryStatus, number> & { total: number };
  lastPublishedAt: string | null;
};

/** Une personne du cercle, tous ses rôles rassemblés. */
export type AdminPerson = {
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
  /** L'administrateur qui regarde : on ne lui propose pas de se retirer. */
  isSelf: boolean;
  since: string;
  roles: { childId: string; childName: string; role: MemberRole }[];
  /** Enfants dont cette personne est le SEUL administrateur (gestes refusés). */
  soleAdminOf: string[];
};

export type AdminInvitationRow = {
  id: string;
  childId: string;
  childName: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  expired: boolean;
};

/** Ce que rend `/api/admin/console` : le périmètre administré, et lui seul. */
export type AdminConsole = {
  children: AdminChildRow[];
  people: AdminPerson[];
  invitations: AdminInvitationRow[];
  totals: {
    children: number;
    people: number;
    admins: number;
    entries: number;
    published: number;
    pendingInvitations: number;
  };
};
