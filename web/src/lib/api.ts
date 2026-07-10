import type { Child, Entry } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
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
};
