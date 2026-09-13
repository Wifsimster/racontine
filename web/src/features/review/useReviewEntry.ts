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

/* ===========================================================================
   LA JOURNÉE QU'ON RELIT : la charger, la suivre, et savoir si elle a changé.

   L'écran de relecture tenait tout : quatorze `useState`, six effets, le
   sondage de la lecture en cours, la liste des rôles, les journées sœurs du
   lot, le brouillon en cours d'édition et son empreinte — mêlés à 1 400 lignes
   de rendu. On ne pouvait pas lire la règle « une lecture en cours se resonde
   toutes les 2,5 s » sans traverser du JSX.

   Ce hook porte L'ÉTAT DE LA DONNÉE ; l'écran garde ce qui est de l'écran :
   ce qu'on publie, ce qu'on annonce, ce qu'on dessine.
   =========================================================================== */

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
  /** Le rôle par enfant (`/api/children`) : `null` = pas encore connu. */
  const [roles, setRoles] = useState<Map<string, MemberRole> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batchDays, setBatchDays] = useState<BatchEntrySummary[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Empreinte de la journée TELLE QU'ELLE EST SUR LE SERVEUR. Voir `dirty`. */
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
    // L'empreinte est calculée avec EXACTEMENT les mêmes normalisations que le
    // correctif envoyé (`currentPatch`) : sans ça, un champ vide côté serveur
    // (`null`) et le même champ vide côté formulaire (`""`) feraient croire à
    // une modification dès l'ouverture de l'écran, et le garde-fou se
    // déclencherait sans qu'on ait touché à rien.
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

  const fetchEntry = useCallback(async () => {
    const e = await api.getEntry(id);
    setLoadError(null);
    hydrate(e);
    if (e.status === "processing") {
      pollRef.current = setTimeout(fetchEntry, 2500);
    }
  }, [id, hydrate]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // L'échec de CHARGEMENT est un état à part entière : avant, il était rangé
    // dans `error` alors que le rendu, lui, restait bloqué sur « Chargement… »
    // parce que `entry` valait toujours null. L'écran mentait indéfiniment.
    fetchEntry().catch((err) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchEntry, reloadKey]);

  /* ── QUI A LE DROIT D'ÊTRE ICI ────────────────────────────────────────────
     `/api/entries/:id` renvoie la journée à TOUS les membres du carnet, lecteurs
     compris (le serveur ne leur cache que les brouillons). Cet écran est un
     ÉDITEUR : ouvert à un lecteur, il lui laissait choisir une suggestion, voir
     le texte changer, taper « Republier la journée » — et lui répondait « accès
     refusé » sur un travail qui ne pourra jamais être enregistré. Le rôle vient
     donc de `/api/children`, et un lecteur reçoit la journée en LECTURE (cf.
     `ReadOnlyDay`) au lieu d'un formulaire piégé.
     Échec de la liste → `null` : on n'invente pas un refus à partir d'une
     requête qui n'a pas répondu, le serveur reste l'arbitre à l'enregistrement. */
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

  // Le carnet photographié peut couvrir plusieurs journées d'un coup : quand
  // c'est le cas, on récupère les journées sœurs du lot pour le stepper.
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
    // Inclut `id` : deux journées voisines d'un même lot ont souvent le même
    // batchId ET le même statut (« draft »), ce qui laisserait cet effet ne
    // jamais se redéclencher en navigation SPA d'une journée à l'autre sans
    // ce repère — et donc le stepper afficher un compte de publication figé.
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
