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

/** Utilisateur courant + s'il est le propriétaire de l'instance. */
export type Me = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
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
