export type EntryStatus = "processing" | "draft" | "published" | "failed";
export type EntrySource = "nounou" | "mam" | "creche" | "maison";
export type ItemType = "meal" | "nap" | "activity" | "anecdote" | "health";

export type MealData = { moment: string; contenu: string; appetit?: string };
export type NapData = { debut?: string; fin?: string; note?: string };
export type ActivityData = { label: string };
export type AnecdoteData = { text: string };
export type HealthData = { note: string };

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
  uncertainties: string[] | null;
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

export const ITEM_LABELS: Record<ItemType, string> = {
  meal: "Repas",
  nap: "Sieste",
  activity: "Activité",
  anecdote: "Anecdote",
  health: "Santé",
};
