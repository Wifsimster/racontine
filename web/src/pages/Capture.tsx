import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X } from "lucide-react";
import { api } from "@/lib/api";
import { type Child, type EntrySource, SOURCE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

type Shot = { file: File; url: string };

/** Date locale du téléphone au format AAAA-MM-JJ (le carnet est photographié le soir). */
function localDate(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export default function Capture() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listChildren()
      .then((kids) => {
        setChildren(kids);
        if (kids.length) setChildId(kids[0].id);
      })
      .catch(() => setChildren([]));
  }, []);

  // Libère les aperçus (object URLs) au démontage.
  useEffect(() => {
    return () => {
      setShots((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.url));
        return prev;
      });
    };
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const added = Array.from(e.target.files).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setShots((prev) => [...prev, ...added]);
    e.target.value = ""; // permet de re-sélectionner le même fichier
  }

  function removeShot(idx: number) {
    setShots((prev) => {
      const s = prev[idx];
      if (s) URL.revokeObjectURL(s.url);
      return prev.filter((_, j) => j !== idx);
    });
  }

  async function submit() {
    setError(null);
    if (!shots.length) {
      setError("Ajoutez au moins une photo.");
      return;
    }
    setSubmitting(true);
    try {
      let cid = childId;
      if (!cid && children.length === 0) {
        // Premier usage : crée un enfant par défaut à renommer ensuite.
        const child = await api.createChild("Mon enfant");
        cid = child.id;
      }
      const res = await api.ingest(
        shots.map((s) => s.file),
        { childId: cid || undefined, source, date: localDate() },
      );
      nav(`/entries/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 p-4">
      <div>
        <h1 className="text-xl font-semibold">Photographier le carnet</h1>
        <p className="text-sm text-muted-foreground">
          Une photo des pages du jour suffit — Racontine s'occupe du récit.
        </p>
      </div>

      {children.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label>Enfant</Label>
          <select
            className="h-10 rounded-md border bg-transparent px-3"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Lieu de la journée</Label>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <Button
              key={s}
              type="button"
              variant={source === s ? "default" : "outline"}
              size="sm"
              onClick={() => setSource(s)}
            >
              {SOURCE_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={onPick}
      />

      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <Camera />
        Ajouter une ou plusieurs pages
      </Button>

      {shots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {shots.map((s, i) => (
            <div key={s.url} className="relative">
              <img
                src={s.url}
                alt={`page ${i + 1}`}
                className="aspect-square w-full rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => removeShot(i)}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-1 shadow"
                aria-label="retirer"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} disabled={submitting || !shots.length}>
        {submitting ? "Envoi…" : "Raconter la journée"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Racontine lit le carnet via l'API Claude et écrit un joli récit de la
        journée, que vous relisez avant de publier.
      </p>
    </div>
  );
}
