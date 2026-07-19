import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Images, X } from "lucide-react";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image";
import { type Child, type EntrySource, SOURCE_LABELS } from "@/lib/types";
import {
  addPhotos,
  clearPhotos,
  getDraftMeta,
  getPhotos,
  removePhoto,
  saveDraftMeta,
} from "@/lib/photo-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

/** `id` référence l'enregistrement persisté ; `file` sert à l'envoi. */
type Shot = { id: string; file: File; url: string };

/** Date locale du téléphone au format AAAA-MM-JJ (le carnet est photographié le soir). */
function localDate(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export default function Capture() {
  const nav = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(false);
  const restoredMeta = useRef(getDraftMeta());

  useEffect(() => {
    api
      .listChildren()
      .then((kids) => {
        setChildren(kids);
        // Restaure l'enfant sélectionné s'il est toujours accessible.
        const savedChild = restoredMeta.current?.childId;
        if (savedChild && kids.some((k) => k.id === savedChild))
          setChildId(savedChild);
        else if (kids.length) setChildId(kids[0].id);
      })
      .catch(() => setChildren([]));
  }, []);

  // Recharge les photos d'un brouillon non envoyé (échec précédent ou refresh).
  useEffect(() => {
    let alive = true;
    const meta = restoredMeta.current;
    if (meta?.source && SOURCES.includes(meta.source as EntrySource))
      setSource(meta.source as EntrySource);
    getPhotos().then((saved) => {
      if (!alive || !saved.length) return;
      const restoredShots = saved.map((s) => ({
        id: s.id,
        file: new File([s.blob], s.name, { type: s.type }),
        url: URL.createObjectURL(s.blob),
      }));
      setShots(restoredShots);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
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

  // Mémorise les réglages de la journée pour les restaurer avec les photos.
  useEffect(() => {
    saveDraftMeta({ childId: childId || undefined, source });
  }, [childId, source]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    e.target.value = ""; // permet de re-sélectionner le même fichier
    // Persiste d'abord : on ne perd rien même si l'app est fermée aussitôt.
    const records = await addPhotos(files);
    const added = records.map((r, i) => ({
      id: r.id,
      file: files[i],
      url: URL.createObjectURL(files[i]),
    }));
    setShots((prev) => [...prev, ...added]);
  }

  function removeShot(idx: number) {
    setShots((prev) => {
      const s = prev[idx];
      if (s) {
        URL.revokeObjectURL(s.url);
        void removePhoto(s.id);
      }
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
      // Réduit chaque page avant l'envoi : évite de dépasser la limite de
      // taille du proxy (upload « Failed to fetch ») et accélère l'envoi en 4G.
      const files = await Promise.all(shots.map((s) => compressImage(s.file)));
      const res = await api.ingest(files, {
        childId: cid || undefined,
        source,
        date: localDate(),
      });
      // Envoi réussi : le brouillon local n'a plus de raison d'être.
      await clearPhotos();
      nav(`/entries/${res.id}`);
    } catch (err) {
      // Échec : on garde les photos persistées, elles restent récupérables.
      setError(err instanceof Error ? err.message : "Échec de l'envoi");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 p-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold">
          Photographier le carnet
        </h1>
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

      {/* Deux entrées distinctes : `capture` ouvre l'appareil photo, son
          absence laisse choisir des images déjà dans l'album (carnet
          photographié plus tôt, capture d'écran d'un message…). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera />
          Photographier
        </Button>
        <Button variant="outline" onClick={() => albumRef.current?.click()}>
          <Images />
          Depuis l'album
        </Button>
      </div>

      {restored && shots.length > 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Photos d'une journée non envoyée restaurées. Vous pouvez terminer
          l'envoi ou les retirer.
        </p>
      )}

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
        journée, que vous relisez avant de publier. Si les photos couvrent
        plusieurs jours, chaque journée est détectée séparément et vous les
        relisez l'une après l'autre.
      </p>
    </div>
  );
}
