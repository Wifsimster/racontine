import type {
  Child,
  Entry,
  Member,
  MemberRole,
  PendingInvitation,
  InvitationPreview,
  Notification,
  Subscriber,
  SubscriptionStatus,
  Me,
  AppSettings,
  SettingsResponse,
  PublicSettings,
  McpToken,
  CreatedMcpToken,
} from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    // fetch ne rejette (TypeError « Failed to fetch ») que si aucune réponse
    // n'est arrivée : réseau coupé, requête trop volumineuse rejetée par le
    // proxy, etc. On remonte un message lisible plutôt que l'erreur brute.
    throw new Error(
      "Connexion interrompue. Vérifiez votre réseau et réessayez.",
    );
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* pas de corps JSON */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listChildren: () => req<Child[]>("/api/children"),

  createChild: (name: string, birthdate?: string) =>
    req<Child>("/api/children", {
      method: "POST",
      body: JSON.stringify({ name, birthdate }),
    }),

  ingest: (files: File[], opts: { childId?: string; source?: string; date?: string }) => {
    const fd = new FormData();
    for (const f of files) fd.append("photos", f);
    if (opts.childId) fd.append("childId", opts.childId);
    if (opts.source) fd.append("source", opts.source);
    if (opts.date) fd.append("date", opts.date);
    return req<{ id: string; status: string }>("/api/entries/ingest", {
      method: "POST",
      body: fd,
    });
  },

  timeline: (opts: { childId?: string; offset?: number; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.childId) p.set("childId", opts.childId);
    if (opts.offset) p.set("offset", String(opts.offset));
    if (opts.limit) p.set("limit", String(opts.limit));
    const qs = p.toString();
    return req<{ entries: Entry[]; nextOffset: number | null }>(
      `/api/entries${qs ? `?${qs}` : ""}`,
    );
  },

  getEntry: (id: string) => req<Entry>(`/api/entries/${id}`),

  updateEntry: (
    id: string,
    patch: Partial<{
      mood: string | null;
      title: string | null;
      story: string | null;
      highlight: string | null;
      transcription: string | null;
      source: string;
      date: string;
      items: { type: string; data: unknown; position?: number }[];
      publish: boolean;
    }>,
  ) =>
    req<Entry>(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteEntry: (id: string) =>
    req<void>(`/api/entries/${id}`, { method: "DELETE" }),

  /* ------------------------------ Partage ------------------------------- */

  listMembers: (childId: string) =>
    req<{ members: Member[]; invitations: PendingInvitation[] }>(
      `/api/children/${childId}/members`,
    ),

  invite: (childId: string, email: string, role: MemberRole) =>
    req<PendingInvitation>(`/api/children/${childId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  revokeInvitation: (id: string) =>
    req<void>(`/api/invitations/${id}`, { method: "DELETE" }),

  setMemberRole: (childId: string, userId: string, role: MemberRole) =>
    req<void>(`/api/children/${childId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeMember: (childId: string, userId: string) =>
    req<void>(`/api/children/${childId}/members/${userId}`, {
      method: "DELETE",
    }),

  getInvitation: (token: string) =>
    req<InvitationPreview>(`/api/invitations/token/${token}`),

  acceptInvitation: (token: string) =>
    req<{ childId: string; role: MemberRole }>(
      `/api/invitations/token/${token}/accept`,
      { method: "POST" },
    ),

  /* -------------------------- Abonnements ----------------------------- */

  getSubscription: (childId: string) =>
    req<SubscriptionStatus>(`/api/children/${childId}/subscription`),

  subscribe: (childId: string, emailEnabled = true) =>
    req<SubscriptionStatus>(`/api/children/${childId}/subscription`, {
      method: "PUT",
      body: JSON.stringify({ emailEnabled }),
    }),

  unsubscribe: (childId: string) =>
    req<void>(`/api/children/${childId}/subscription`, { method: "DELETE" }),

  listSubscribers: (childId: string) =>
    req<{ subscribers: Subscriber[] }>(
      `/api/children/${childId}/subscribers`,
    ),

  /* ------------------------- Notifications ---------------------------- */

  listNotifications: (limit = 30) =>
    req<{ notifications: Notification[]; unread: number }>(
      `/api/notifications?limit=${limit}`,
    ),

  markNotificationRead: (id: string) =>
    req<void>(`/api/notifications/${id}/read`, { method: "POST" }),

  markAllNotificationsRead: () =>
    req<void>("/api/notifications/read-all", { method: "POST" }),

  /* --------------------------- Réglages ------------------------------- */

  me: () => req<Me>("/api/me"),

  publicSettings: () => req<PublicSettings>("/api/settings/public"),

  getSettings: () => req<SettingsResponse>("/api/settings"),

  updateSettings: (patch: Partial<AppSettings>) =>
    req<SettingsResponse>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  /* ---------------------------- Jetons MCP ---------------------------- */

  listMcpTokens: () => req<{ tokens: McpToken[] }>("/api/mcp/tokens"),

  createMcpToken: (name: string) =>
    req<CreatedMcpToken>("/api/mcp/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  revokeMcpToken: (id: string) =>
    req<void>(`/api/mcp/tokens/${id}`, { method: "DELETE" }),
};
