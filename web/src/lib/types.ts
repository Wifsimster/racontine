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

export type Child = {
  id: string;
  name: string;
  birthdate: string | null;
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
