import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { roleMap } from "@/lib/access";
import {
  type BatchEntrySummary,
  type Entry,
  type EntrySource,
  type ItemType,
  type MemberRole,
} from "@/lib/types";
import {
  emptyDraft,
  fingerprint,
  pruneEmpty,
  toDraftItems,
  type DraftItem,
} from "./draft";

export type ReviewEntryState = ReturnType<typeof useReviewEntry>;

export function useReviewEntry(id: string) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [highlight, setHighlight] = useState("");
  const [mood, setMood] = useState("");
  const [transcription, setTranscription] = useState("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [date, setDate] = useState("");
  const [roles, setRoles] = useState<Map<string, MemberRole> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batchDays, setBatchDays] = useState<BatchEntrySummary[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clean = useRef("");

  const hydrate = useCallback((e: Entry) => {
    setEntry(e);
    setItems(toDraftItems(e.items));
    setTitle(e.title ?? "");
    setStory(e.story ?? "");
    setHighlight(e.highlight ?? "");
    setMood(e.mood ?? "");
    setTranscription(e.transcription ?? "");
    setSource(e.source);
    setDate(e.date);
    clean.current = fingerprint({
      title: e.title,
      story: e.story,
      highlight: e.highlight,
      mood: e.mood,
      transcription: e.transcription,
      source: e.source,
      date: e.date,
      items: toDraftItems(e.items),
    });
  }, []);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const fetchEntry = async (): Promise<void> => {
      const e = await api.getEntry(id);
      if (!alive) return;
      setLoadError(null);
      hydrate(e);
      if (e.status === "processing")
        pollRef.current = setTimeout(() => void fetchEntry().catch(fail), 2500);
    };
    const fail = (err: unknown) => {
      if (alive) setLoadError(err instanceof Error ? err.message : String(err));
    };
    fetchEntry().catch(fail);
    return () => {
      alive = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [id, hydrate, reloadKey]);

  useEffect(() => {
    let alive = true;
    api.listChildren().then(
      (list) => {
        if (alive) setRoles(roleMap(list));
      },
      () => {
        if (alive) setRoles(null);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!entry?.batchId) {
      setBatchDays(null);
      return;
    }
    let alive = true;
    api
      .getEntryBatch(entry.batchId)
      .then((r) => {
        if (alive) setBatchDays(r.entries);
      })
      .catch(() => {
        if (alive) setBatchDays(null);
      });
    return () => {
      alive = false;
    };
  }, [entry?.batchId, entry?.status, id]);

  function setItemField(idx: number, key: string, value: string) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, data: { ...it.data, [key]: value } } : it,
      ),
    );
  }

  function addItem(type: ItemType) {
    setItems((prev) => [
      ...prev,
      { type, data: emptyDraft(type), position: prev.length },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function cleanedItems() {
    return items
      .map((it, position) => ({ type: it.type, data: pruneEmpty(it.data), position }))
      .filter((it) => Object.keys(it.data).length > 0);
  }

  function currentPatch() {
    return {
      title: title.trim() || null,
      story: story.trim() || null,
      highlight: highlight.trim() || null,
      mood: mood || null,
      transcription: transcription || null,
      source,
      date,
      items: cleanedItems(),
    };
  }

  const dirty = useMemo(
    () =>
      entry && (entry.status === "draft" || entry.status === "published")
        ? JSON.stringify(currentPatch()) !== clean.current
        : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, title, story, highlight, mood, transcription, source, date, items],
  );

  return {
    entry,
    setEntry,
    items,
    setItems,
    title,
    setTitle,
    story,
    setStory,
    highlight,
    setHighlight,
    mood,
    setMood,
    transcription,
    setTranscription,
    source,
    setSource,
    date,
    setDate,
    roles,
    loadError,
    setLoadError,
    batchDays,
    reload: () => setReloadKey((k) => k + 1),
    hydrate,
    setItemField,
    addItem,
    removeItem,
    currentPatch,
    dirty,
  };
}
