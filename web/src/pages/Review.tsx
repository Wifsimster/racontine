import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type Entry,
  type EntryItem,
  type ItemType,
  type EntrySource,
  ITEM_LABELS,
  SOURCE_LABELS,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type DraftItem = { type: ItemType; data: Record<string, string>; position: number };

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

function toDraftItems(items: EntryItem[]): DraftItem[] {
  return items.map((it, i) => ({
    type: it.type,
    data: { ...(it.data as Record<string, string>) },
    position: it.position ?? i,
  }));
}

const EMPTY: Record<ItemType, Record<string, string>> = {
  meal: { moment: "", contenu: "", appetit: "" },
  nap: { debut: "", fin: "", note: "" },
  activity: { label: "" },
  anecdote: { text: "" },
  health: { note: "" },
};

export default function Review() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [highlight, setHighlight] = useState("");
  const [mood, setMood] = useState("");
  const [transcription, setTranscription] = useState("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, []);

  const fetchEntry = useCallback(async () => {
    const e = await api.getEntry(id);
    hydrate(e);
    if (e.status === "processing") {
      pollRef.current = setTimeout(fetchEntry, 2500);
    }
  }, [id, hydrate]);

  useEffect(() => {
    fetchEntry().catch((err) => setError(err.message));
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchEntry]);

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
      { type, data: { ...EMPTY[type] }, position: prev.length },
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

  async function save(publish: boolean) {
    setSaving(true);
    setError(null);
    try {
      await api.updateEntry(id, {
        title: title.trim() || null,
        story: story.trim() || null,
        highlight: highlight.trim() || null,
        mood: mood || null,
        transcription: transcription || null,
        source,
        date,
        items: cleanedItems(),
        publish,
      });
      if (publish) nav("/");
      else {
        const e = await api.getEntry(id);
        hydrate(e);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Supprimer cette entrée ?")) return;
    await api.deleteEntry(id);
    nav("/");
  }

  if (!entry) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Chargement…
      </div>
    );
  }

  if (entry.status === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-8 text-center">
        <div className="relative">
          <Sparkles className="size-8 animate-pulse text-primary" />
        </div>
        <p className="font-medium">Racontine écrit la journée…</p>
        <p className="text-sm text-muted-foreground">
          Lecture du carnet et mise en récit. Quelques secondes suffisent.
        </p>
        {entry.attachments.length > 0 && (
          <img
            src={entry.attachments[0].thumbUrl}
            alt="page"
            className="mt-2 max-h-64 rounded-lg object-contain"
          />
        )}
      </div>
    );
  }

  if (entry.status === "failed") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-8 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="font-medium">La lecture du carnet a échoué</p>
        <p className="text-sm text-muted-foreground">{entry.failureReason}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav("/capture")}>
            Reprendre une photo
          </Button>
          <Button variant="destructive" onClick={remove}>
            <Trash2 /> Supprimer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 pb-28">
      <div className="grid gap-6 md:grid-cols-[1fr_1.15fr]">
        {/* Photos originales — la source */}
        <div className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
          <h2 className="text-sm font-medium text-muted-foreground">
            Page(s) du carnet
          </h2>
          {entry.attachments.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
              <img
                src={a.url}
                alt="page du carnet"
                className="w-full rounded-lg border object-contain"
              />
            </a>
          ))}
        </div>

        {/* La valorisation — ce qui sera publié */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-serif text-2xl font-semibold">
              Relire et valoriser
            </h1>
            <p className="text-sm text-muted-foreground">
              Racontine a écrit la journée. Ajustez si besoin, puis publiez.
            </p>
          </div>

          {entry.uncertainties && entry.uncertainties.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4" /> À vérifier
              </p>
              <ul className="list-inside list-disc text-sm text-amber-700 dark:text-amber-400">
                {entry.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Titre */}
          <div className="flex flex-col gap-1.5">
            <Label>Titre de la journée</Label>
            <Input
              value={title}
              placeholder="Une jolie journée…"
              className="font-serif text-lg md:text-lg"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Récit — le cœur */}
          <div className="flex flex-col gap-1.5">
            <Label>Le récit de la journée</Label>
            <Textarea
              rows={5}
              value={story}
              placeholder="Le récit chaleureux que liront les proches…"
              className="text-[15px] leading-relaxed"
              onChange={(e) => setStory(e.target.value)}
            />
          </div>

          {/* Temps fort */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Star className="size-3.5 text-primary" /> Temps fort du jour
            </Label>
            <Input
              value={highlight}
              placeholder="Le moment à retenir…"
              onChange={(e) => setHighlight(e.target.value)}
            />
          </div>

          {/* Contexte compact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lieu</Label>
              <select
                className="h-10 rounded-md border bg-transparent px-3"
                value={source}
                onChange={(e) => setSource(e.target.value as EntrySource)}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Humeur</Label>
            <Input value={mood} onChange={(e) => setMood(e.target.value)} />
          </div>

          {/* Détails structurés — secondaires, repliés par défaut */}
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                Détails de la journée (repas, siestes, activités…)
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-5 border-t p-3">
              <ItemEditor
                items={items}
                onField={setItemField}
                onRemove={removeItem}
                onAdd={addItem}
              />

              <div className="flex flex-col gap-1.5">
                <Label>Transcription intégrale</Label>
                <Textarea
                  rows={5}
                  value={transcription}
                  onChange={(e) => setTranscription(e.target.value)}
                />
              </div>
            </div>
          </details>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      {/* Barre d'action */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => save(false)}
            disabled={saving}
          >
            Enregistrer
          </Button>
          <Button className="flex-1" onClick={() => save(true)} disabled={saving}>
            <Sparkles />
            {entry.status === "published"
              ? "Republier dans le journal"
              : "Publier dans le journal"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function pruneEmpty(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

/* ------------------------------ Éditeur d'items --------------------------- */

const FIELD_LABELS: Record<string, string> = {
  moment: "Moment",
  contenu: "Contenu",
  appetit: "Appétit",
  debut: "Début",
  fin: "Fin",
  note: "Note",
  label: "Activité",
  text: "Anecdote",
};

const ADD_TYPES: ItemType[] = ["meal", "nap", "activity", "anecdote", "health"];

function ItemEditor({
  items,
  onField,
  onRemove,
  onAdd,
}: {
  items: DraftItem[];
  onField: (idx: number, key: string, value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: (type: ItemType) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {ADD_TYPES.map((type) => {
        const rows = items
          .map((it, idx) => ({ it, idx }))
          .filter((x) => x.it.type === type);
        return (
          <div key={type} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{ITEM_LABELS[type]}</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onAdd(type)}
              >
                <Plus /> Ajouter
              </Button>
            </div>
            {rows.map(({ it, idx }) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-md border p-2"
              >
                <div className="grid flex-1 gap-2">
                  {Object.keys(it.data).map((key) => (
                    <div key={key} className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        {FIELD_LABELS[key] ?? key}
                      </span>
                      <Input
                        className="h-9"
                        value={it.data[key] ?? ""}
                        onChange={(e) => onField(idx, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(idx)}
                  aria-label="supprimer"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
