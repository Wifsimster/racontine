import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  CloudOff,
  Images,
  Info,
  Layers,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { writableChildren } from "@/lib/access";
import { useBilling } from "@/lib/billing";
import { CapturePaused } from "@/features/billing/parts";
import { compressImage } from "@/lib/image";
import { type Child, type EntrySource } from "@/lib/types";
import {
  addPhotos,
  clearPhotos,
  getDraftMeta,
  getPhotos,
  removePhoto,
  saveDraftMeta,
} from "@/lib/photo-store";
import { Button } from "@/components/ui/button";
import { CaptureSteps, type Step } from "@/components/CaptureSteps";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  localDate,
  pageCount,
  type Phase,
  type Shot,
  type Stage,
} from "@/features/capture/model";
import { DayRow, PageGrid } from "@/features/capture/inputs";
import { SendError, SendingPanel } from "@/features/capture/panels";
import { CaptureDenied, CaptureEmpty } from "@/features/capture/empty";

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

export default function Capture() {
  const nav = useNavigate();
  const { billing } = useBilling();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [access, setAccess] = useState<"open" | "reader" | null>(null);
  const [childId, setChildId] = useState<string>("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [shots, setShots] = useState<Shot[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<Stage>("prep");
  const [prepDone, setPrepDone] = useState(0);
  const [error, setError] = useState<string>("");
  const [restored, setRestored] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  const restoredMeta = useRef(getDraftMeta());
  const cancelled = useRef(false);

  useEffect(() => {
    api
      .listChildren()
      .then((kids) => {
        const mine = writableChildren(kids);
        setChildren(mine);
        setAccess(mine.length || kids.length === 0 ? "open" : "reader");
        const savedChild = restoredMeta.current?.childId;
        if (savedChild && mine.some((k) => k.id === savedChild))
          setChildId(savedChild);
        else if (mine.length) setChildId(mine[0].id);
      })
      .catch(() => {
        setChildren([]);
        setAccess("open");
      });
  }, []);

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

  useEffect(() => {
    if (access !== "open") return;
    let alive = true;
    const active = () =>
      (navigator as Navigator & { userActivation?: { isActive: boolean } })
        .userActivation?.isActive === true;
    if (!active()) return;
    getPhotos().then((saved) => {
      if (!alive || saved.length || !active()) return;
      cameraRef.current?.click();
    });
    return () => {
      alive = false;
    };
  }, [access]);

  useEffect(() => {
    return () => {
      setShots((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.url));
        return prev;
      });
    };
  }, []);

  useEffect(() => {
    saveDraftMeta({ childId: childId || undefined, source });
  }, [childId, source]);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    const records = await addPhotos(files);
    const added = records.map((r, i) => ({
      id: r.id,
      file: files[i],
      url: URL.createObjectURL(files[i]),
    }));
    setShots((prev) => [...prev, ...added]);
    setPhase("idle");
    setRestored(false);
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
    setPhase("idle");
  }

  async function resetAll() {
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
    setRestored(false);
    setPhase("idle");
    await clearPhotos();
  }

  function cancelSend() {
    cancelled.current = true;
  }

  async function submit() {
    setError("");
    cancelled.current = false;
    if (!shots.length) {
      setError("Ajoutez au moins une page du carnet avant l’envoi.");
      setPhase("error");
      return;
    }
    setPhase("sending");
    setStage("prep");
    setPrepDone(0);
    try {
      let cid = childId;
      if (!cid && children.length === 0) {
        const child = await api.createChild("Mon enfant");
        cid = child.id;
        setChildren([child]);
        setChildId(child.id);
      }
      const files: File[] = [];
      for (const s of shots) {
        files.push(await compressImage(s.file));
        if (cancelled.current) {
          setPhase("idle");
          setPrepDone(0);
          return;
        }
        setPrepDone((n) => n + 1);
      }
      setStage("upload");
      const res = await api.ingest(files, {
        childId: cid || undefined,
        source,
        date: localDate(),
      });
      await clearPhotos();
      nav(`/entries/${res.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "L’envoi du carnet a échoué. Vos pages sont conservées.",
      );
      setPhase("error");
    }
  }

  const childName =
    children.find((c) => c.id === childId)?.name ?? "Votre enfant";
  const hasPages = shots.length > 0;

  const steps: Step[] = [
    {
      key: "photo",
      label: "Photo",
      state: phase === "idle" ? "current" : "done",
    },
    {
      key: "read",
      label: "Lecture",
      state:
        phase === "sending" ? "current" : phase === "error" ? "failed" : "todo",
    },
    { key: "review", label: "Relecture", state: "todo" },
    { key: "share", label: "Partage", state: "todo" },
  ];

  if (access === "reader") return <CaptureDenied />;

  if (billing?.enabled && !billing.access.open)
    return <CapturePaused billing={billing} />;

  return (
    <div className="shell-width flex flex-col gap-4 px-4 pt-4 pb-40">
      <h1 aria-label="Photographier le carnet" />

      <CaptureSteps steps={steps} />

      {offline && (
        <p className="flex items-start gap-3 rounded-xl bg-warning-bg px-4 py-3 text-meta text-warning">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">Hors ligne.</span> Les pages restent
            enregistrées sur l’appareil ; l’envoi partira dès le retour du
            réseau.
          </span>
        </p>
      )}

      {restored && hasPages && phase === "idle" && (
        <div className="flex items-start gap-3 rounded-xl bg-warning-bg px-4 py-3 text-warning">
          <Layers className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col items-start gap-2">
            <p className="text-meta">
              <span className="font-bold">Journée non envoyée retrouvée.</span>{" "}
              Ses {pageCount(shots.length)} sont encore là. Terminez l’envoi, ou
              repartez de zéro.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReset(true)}
            >
              Repartir de zéro
            </Button>
          </div>
        </div>
      )}

      {phase === "sending" ? (
        <SendingPanel
          shots={shots}
          stage={stage}
          prepDone={prepDone}
          onCancel={cancelSend}
        />
      ) : (
        <>
          <DayRow
            kids={children}
            childId={childId}
            onChildId={setChildId}
            source={source}
            onSource={setSource}
          />

          {phase === "error" && (
            <SendError
              message={error}
              shots={shots}
              childName={childName}
              source={source}
            />
          )}

          {hasPages ? (
            <>
              <PageGrid shots={shots} onRemove={removeShot} />

              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera aria-hidden="true" />
                  Photographier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => albumRef.current?.click()}
                >
                  <Images aria-hidden="true" />
                  Depuis l’album
                </Button>
              </div>

              {shots.length > 1 && (
                <p className="flex items-start gap-2 text-meta text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Si ces pages couvrent plusieurs jours, chaque journée sera
                  détectée et relue séparément.
                </p>
              )}
            </>
          ) : (
            phase === "idle" && <CaptureEmpty />
          )}
        </>
      )}

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

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div
          aria-hidden="true"
          className="h-12 bg-gradient-to-t from-background to-transparent"
        />
        <div className="flex justify-center bg-background px-4 pb-safe-6">
          <div className="action-width pointer-events-auto flex flex-col gap-2">
            {phase === "sending" && (
              <Button size="lg" disabled className="shadow-lift">
                {stage === "prep" ? "Préparation…" : "Envoi…"}
              </Button>
            )}

            {phase === "error" && (
              <>
                <Button size="lg" onClick={submit} className="shadow-lift">
                  <RotateCcw aria-hidden="true" />
                  Réessayer l’envoi
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Revenir au journal</Link>
                </Button>
              </>
            )}

            {phase === "idle" && hasPages && (
              <>
                <Button
                  size="lg"
                  onClick={submit}
                  disabled={offline}
                  className="shadow-lift"
                >
                  <ScanLine aria-hidden="true" />
                  Raconter la journée
                </Button>
                <p className="text-center text-meta text-muted-foreground">
                  Vous relirez la journée avant qu’elle ne parte aux proches.
                </p>
              </>
            )}

            {phase === "idle" && !hasPages && (
              <>
                <Button
                  size="lg"
                  onClick={() => cameraRef.current?.click()}
                  className="shadow-lift"
                >
                  <Camera aria-hidden="true" />
                  Photographier le carnet
                </Button>
                <Button
                  variant="outline"
                  onClick={() => albumRef.current?.click()}
                >
                  <Images aria-hidden="true" />
                  Importer depuis l’album
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repartir de zéro ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {pageCount(shots.length)} retrouvées seront retirées de
              l’appareil. Le carnet de papier, lui, ne bouge pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder les pages</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetAll}>
              Tout retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
