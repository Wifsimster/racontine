import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X } from "lucide-react";
import { api } from "@/lib/api";
import { type Child, type EntrySource, SOURCE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

export default function Capture() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [files, setFiles] = useState<File[]>([]);
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

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  }

  async function submit() {
    setError(null);
    if (!files.length) {
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
      const res = await api.ingest(files, { childId: cid || undefined, source });
      nav(`/entries/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 p-4">
      <h1 className="text-xl font-semibold">Photographier le carnet</h1>

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

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img
                src={URL.createObjectURL(f)}
                alt={`page ${i + 1}`}
                className="aspect-square w-full rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
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

      <Button onClick={submit} disabled={submitting || !files.length}>
        {submitting ? "Envoi…" : "Envoyer pour extraction"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Cette page sera analysée via l'API Claude pour structurer la journée.
      </p>
    </div>
  );
}
