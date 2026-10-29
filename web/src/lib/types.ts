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
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  uncertainties: Uncertainty[] | null;
  publishedAt: string | null;
  items: EntryItem[];
  attachments: AttachmentRef[];
  batchId: string | null;
};

export type TimelinePage = {
  entries: Entry[];
  nextCursor: string | null;
};

export type JournalMonth = {
  month: string;
  count: number;
};

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

export type Me = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
  isAdmin: boolean;
};

export type AppSettings = {
  appName: string;
  signupEnabled: boolean;
  invitationTtlDays: number;
  vlmModel: string;
  emailNotificationsEnabled: boolean;
};

export type SettingsMeta = {
  mailConfigured: boolean;
  webPushConfigured: boolean;
  notifyWebhookConfigured: boolean;
  webBaseUrl: string;
  knownVlmModels: string[];
};

export type UserLlm = {
  configured: boolean;
  hint: string | null;
};

export type SettingsResponse = {
  settings: AppSettings;
  meta: SettingsMeta;
};

export type PublicSettings = {
  appName: string;
  signupEnabled: boolean;
};

export type McpToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type CreatedMcpToken = {
  token: McpToken;
  secret: string;
};

export type AccessReason =
  | "self-hosted"
  | "trial"
  | "subscribed"
  | "payment-late"
  | "trial-over"
  | "subscription-over";

export type CarnetAccess = {
  open: boolean;
  reason: AccessReason;
  daysLeft: number | null;
  until: string | null;
  endingAt: string | null;
};

export type PlanPrice = {
  unitAmount: number;
  currency: string;
  interval: string;
  intervalCount: number;
};

export type BillingOffer = {
  enabled: boolean;
  price: PlanPrice | null;
  trialDays: number;
};

export type Billing = {
  enabled: boolean;
  access: CarnetAccess;
  price: PlanPrice | null;
  canManage: boolean;
  hasSubscription: boolean;
  billedTo: { name: string; email: string } | null;
};

export type AdminChildRow = {
  id: string;
  name: string;
  birthdate: string | null;
  members: number;
  entries: Record<EntryStatus, number> & { total: number };
  lastPublishedAt: string | null;
};

export type AdminPerson = {
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
  isSelf: boolean;
  since: string;
  roles: { childId: string; childName: string; role: MemberRole }[];
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

export type CarnetRef = { id: string; name: string };

export type ErasurePreview = { deletes: CarnetRef[]; leaves: CarnetRef[] };

export type ErasureBlock = {
  error: string;
  code?: "subscription_active" | "instance_owner" | "sole_admin";
  carnets: CarnetRef[];
};
