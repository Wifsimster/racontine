import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitreCarnet } from "@/components/TitreCarnet";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  BookOpenText,
  ChevronDown,
  FileText,
  Images,
  Star,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { canWrite } from "@/lib/access";
import { preloadImage } from "@/lib/image";
import {
  type EntrySource,
  type Uncertainty,
  type UncertaintyField,
  SOURCE_LABELS,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useReviewEntry } from "@/features/review/useReviewEntry";
import { capitalize, longDate } from "@/lib/format";
import { phraseAround, wordMatcher } from "@/lib/reading-text";
import { normalizeUncertainties } from "@/features/review/draft";
import { GrowingTextarea, MomentsGlance } from "@/features/review/moments";
import { ItemEditor } from "@/features/review/ItemEditor";
import {
  CollapsedReading,
  ResolvedReading,
  UncertaintyCard,
} from "@/features/review/uncertainties";
import {
  LoadFailed,
  ProcessingView,
  ReadFailed,
  ReviewSkeleton,
} from "@/features/review/states";
import {
  LeaveGuardDialog,
  RemovePageDialog,
  ReviewActionBar,
} from "@/features/review/ReviewActionBar";
import { ReadOnlyDay } from "@/features/review/ReadOnlyDay";
import { SourcePage } from "@/features/review/source";
import { SouvenirsEditor } from "@/features/journal/souvenirs";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DayStepper } from "@/components/DayStepper";
import { CaptureSteps, type Step } from "@/components/CaptureSteps";

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

export default function Review() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const {
    entry,
    setEntry,
    items,
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
    reload,
    hydrate,
    setItemField,
    addItem,
    removeItem,
    currentPatch,
    dirty,
  } = useReviewEntry(id);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"save" | "stopped">("save");
  const [publishSeconds, setPublishSeconds] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveAttachment, setConfirmRemoveAttachment] = useState<
    string | null
  >(null);
  const [removingAttachment, setRemovingAttachment] = useState<string | null>(
    null,
  );
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<"pages" | "texte">("pages");
  const [rotating, setRotating] = useState<Record<string, number>>({});
  useEffect(() => setRotating({}), [id]);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [openUncertainty, setOpenUncertainty] = useState<number | null>(null);
  const [justResolved, setJustResolved] = useState<number | null>(null);
  const [focusField, setFocusField] = useState<UncertaintyField | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const publishAbort = useRef<AbortController | null>(null);
  const focusedReading = useRef<string | null>(null);
  const leaving = useRef(false);




  useEffect(() => {
    if (saving !== "publish") {
      setPublishSeconds(0);
      return;
    }
    const start = performance.now();
    const t = setInterval(
      () => setPublishSeconds(Math.round((performance.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [saving]);


  const uncertainties = useMemo(
    () => normalizeUncertainties(entry?.uncertainties),
    [entry?.uncertainties],
  );
  const pending = uncertainties.filter((u) => !u.resolved).length;

  const flaggedValues = useMemo(
    () =>
      uncertainties
        .filter((u) => !u.resolved)
        .map((u) => wordMatcher(u.original))
        .filter((re): re is RegExp => re !== null),
    [uncertainties],
  );

  const phraseFor = useCallback(
    (u: Uncertainty): string | null => {
      const named =
        u.champ === "titre"
          ? title
          : u.champ === "recit"
            ? story
            : u.champ === "temps_fort"
              ? highlight
              : "";
      for (const text of [transcription, named, story, highlight, title]) {
        const phrase = text ? phraseAround(text, u.original) : null;
        if (phrase) return phrase;
      }
      return null;
    },
    [transcription, story, highlight, title],
  );

  const openIndex = useMemo(() => {
    const left = uncertainties
      .map((u, i) => ({ u, i }))
      .filter((x) => !x.u.resolved)
      .map((x) => x.i);
    return openUncertainty !== null && left.includes(openUncertainty)
      ? openUncertainty
      : (left[0] ?? null);
  }, [uncertainties, openUncertainty]);

  useEffect(() => {
    if (!entry || entry.status === "processing") return;
    if (focusedReading.current === entry.id) return;
    if (openIndex === null) {
      focusedReading.current = entry.id;
      return;
    }
    const el = document.getElementById(`rv-u-${openIndex}`);
    if (!el) return;
    const active = document.activeElement;
    if (active && active !== document.body && el.contains(active) === false) {
      focusedReading.current = entry.id;
      return;
    }
    focusedReading.current = entry.id;
    el.focus();
  }, [entry, openIndex]);

  const save = useCallback(
    async (publish: boolean): Promise<boolean> => {
      setSaving(publish ? "publish" : "draft");
      setError(null);
      const ctrl = publish ? new AbortController() : null;
      if (ctrl) publishAbort.current = ctrl;
      try {
        await api.updateEntry(
          id,
          { ...currentPatch(), publish },
          ctrl?.signal,
        );
        if (publish) {
          leaving.current = true;
          const batchId = entry?.batchId;
          const next = batchId
            ? await api
                .getEntryBatch(batchId)
                .then((r) => r.entries.find((d) => d.status !== "published"))
                .catch(() => undefined)
            : undefined;
          if (next) nav(`/entries/${next.id}`, { replace: true });
          else
            nav("/", {
              replace: true,
              state: {
                published: {
                  entryId: id,
                  title: title.trim() || entry?.title || null,
                  childName: entry?.child?.name ?? null,
                  again: entry?.status === "published",
                },
              },
            });
        } else {
          const e = await api.getEntry(id);
          hydrate(e);
        }
        return true;
      } catch (err) {
        const stopped = err instanceof DOMException && err.name === "AbortError";
        setErrorKind(stopped ? "stopped" : "save");
        setError(
          stopped
            ? "Le carnet n’avait pas encore répondu : la publication n’est donc pas confirmée — elle a peut-être abouti malgré tout. Vos corrections sont toujours à l’écran. Ouvrez le journal pour voir l’état de la journée, ou publiez à nouveau : une journée déjà publiée le reste, sans doublon."
            : err instanceof Error
              ? err.message
              : "Échec de l'enregistrement",
        );
        return false;
      } finally {
        publishAbort.current = null;
        setSaving(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, entry?.batchId, nav, hydrate, items, title, story, highlight, mood, transcription, source, date],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leaving.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  const canEditEntry =
    !entry || roles === null ? true : canWrite(roles.get(entry.childId));

  const aMarquerLu =
    entry?.status === "published" && entry.read === false ? entry.id : null;
  useEffect(() => {
    if (aMarquerLu) void api.setEntryRead(aMarquerLu, true).catch(() => {});
  }, [aMarquerLu]);

  useEffect(() => {
    if (!canEditEntry) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void save(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, canEditEntry]);

  async function resolveUncertainty(index: number, value: string) {
    setResolvingIndex(index);
    setError(null);
    try {
      await api.updateEntry(id, currentPatch());
      const e = await api.resolveUncertainty(id, index, value);
      hydrate(e);
      setOpenUncertainty(null);
      setJustResolved(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la validation");
    } finally {
      setResolvingIndex(null);
    }
  }

  useEffect(() => {
    if (justResolved === null) return;
    const el = document.getElementById(
      `rv-u-${openIndex !== null ? openIndex : justResolved}`,
    );
    setJustResolved(null);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = 64;
    const bottom = window.innerHeight - (barRef.current?.offsetHeight ?? 104) - 8;
    if (r.top >= top && r.bottom <= bottom) return;
    el.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [justResolved, uncertainties, openIndex]);

  useEffect(() => {
    if (!focusField) return;
    const target =
      focusField === "titre"
        ? "rv-title"
        : focusField === "temps_fort"
          ? "rv-highlight"
          : focusField === "transcription_integrale"
            ? "rv-transcription"
            : "rv-story";
    if (
      focusField === "transcription_integrale" &&
      (!sourceOpen || sourceTab !== "texte")
    ) {
      setSourceOpen(true);
      setSourceTab("texte");
      return;
    }
    const el = document.getElementById(target);
    setFocusField(null);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    (el as HTMLTextAreaElement).focus({ preventScroll: true });
  }, [focusField, sourceOpen, sourceTab]);

  const showBar =
    !!entry &&
    entry.status !== "processing" &&
    entry.status !== "failed" &&
    canEditEntry;
  useEffect(() => {
    const el = barRef.current;
    if (!showBar || !el) return;
    const root = document.documentElement;
    const apply = () => {
      const h = el.offsetHeight;
      setBarHeight(h);
      root.style.scrollPaddingBottom = `${h + 16}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.scrollPaddingBottom = "";
    };
  }, [showBar]);

  async function remove() {
    await api.deleteEntry(id);
    leaving.current = true;
    nav("/");
  }

  async function retryRead() {
    setRetrying(true);
    setError(null);
    try {
      await api.retryEntryRead(id);
      reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Échec de la relance de la lecture",
      );
    } finally {
      setRetrying(false);
    }
  }

  async function rotateAttachment(attachmentId: string) {
    setRotating((prev) => ({
      ...prev,
      [attachmentId]: (prev[attachmentId] ?? 0) + 1,
    }));
    setError(null);
    try {
      const rotated = await api.rotateAttachment(attachmentId);
      await preloadImage(rotated.url);
      setEntry((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments.map((a) =>
                a.id === attachmentId ? { ...a, ...rotated } : a,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec de la rotation de la page",
      );
    } finally {
      setRotating((prev) => {
        const pending = (prev[attachmentId] ?? 1) - 1;
        const next = { ...prev };
        if (pending > 0) next[attachmentId] = pending;
        else delete next[attachmentId];
        return next;
      });
    }
  }

  async function removeAttachment(attachmentId: string) {
    setRemovingAttachment(attachmentId);
    setError(null);
    try {
      await api.deleteAttachment(attachmentId);
      setEntry((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments.filter((a) => a.id !== attachmentId),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec du retrait de la page",
      );
    } finally {
      setRemovingAttachment(null);
      setConfirmRemoveAttachment(null);
    }
  }

  if (loadError && !entry) {
    return (
      <LoadFailed
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          reload();
        }}
      />
    );
  }

  if (!entry) return <ReviewSkeleton />;

  if (entry.status === "processing") {
    return <ProcessingView attachments={entry.attachments} />;
  }

  if (entry.status === "failed") {
    return (
      <ReadFailed
        when={`${capitalize(longDate(entry.date))} · ${SOURCE_LABELS[entry.source]}`}
        reason={entry.failureReason}
        canRetry={entry.attachments.length > 0 && canEditEntry}
        retrying={retrying}
        error={error}
        onRetry={retryRead}
        onDelete={() => setConfirmDelete(true)}
        confirmOpen={confirmDelete}
        onConfirmOpenChange={setConfirmDelete}
        onConfirmDelete={remove}
      />
    );
  }

  if (!canEditEntry) {
    return <ReadOnlyDay entry={entry} reader />;
  }

  const attachmentToRemove = entry.attachments.find(
    (a) => a.id === confirmRemoveAttachment,
  );
  const words = transcription.trim()
    ? transcription.trim().split(/\s+/).length
    : 0;
  const published = entry.status === "published";
  const hasStepper = !!batchDays && batchDays.length > 1;

  const steps: Step[] = [
    { key: "photo", label: "Photo", state: "done" },
    { key: "read", label: "Lecture", state: "done" },
    { key: "review", label: "Relecture", state: published ? "done" : "current" },
    {
      key: "share",
      label: "Partage",
      state: published ? "done" : "todo",
    },
  ];

  return (
    <div
      className="mx-auto w-full max-w-5xl p-4"
      style={{ paddingBottom: barHeight ? barHeight + 24 : 128 }}
    >
      {!hasStepper && <CaptureSteps steps={steps} className="mb-4 w-full" />}

      {hasStepper && (
        <div className="mb-4">
          <DayStepper
            days={batchDays}
            currentId={id}
            onSelect={(nextId) => nav(`/entries/${nextId}`)}
          />
        </div>
      )}

      <header className="mb-4">
        <div className="min-w-0">
          <TitreCarnet title="Relire la journée" accent="la journée" tone="anecdote" />
          <p className="mt-1 text-meta text-muted-foreground">
            {[
              entry.child?.name,
              capitalize(longDate(entry.date)),
              SOURCE_LABELS[entry.source],
            ]
              .filter(Boolean)
              .concat(published ? ["publiée"] : [])
              .map((part, i, all) => (
                <span key={i}>
                  <span className="whitespace-nowrap">
                    {part}
                    {i < all.length - 1 ? " ·" : ""}
                  </span>
                  {i < all.length - 1 ? " " : ""}
                </span>
              ))}
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-6">
        <section
          aria-label="La source"
          className="flex flex-col gap-3 md:sticky md:top-4 md:self-start"
        >
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            aria-expanded={sourceOpen}
            aria-controls="rv-source"
            className="tap flex min-h-11 w-full items-center gap-3 rounded-2xl border bg-card p-2 text-left shadow-card transition-colors dur-fast ease-carnet outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <span className="flex shrink-0 -space-x-2" aria-hidden="true">
              {entry.attachments.slice(0, 3).map((a) => (
                <img
                  key={a.id}
                  src={a.thumbUrl}
                  alt=""
                  className="seam size-8 rounded-md bg-muted object-cover object-top"
                />
              ))}
              {entry.attachments.length === 0 && (
                <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Images className="size-4" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ui font-bold">Ce qui est écrit</span>
              <span className="text-meta text-muted-foreground">
                {" · "}
                {entry.attachments.length === 1
                  ? "1 page"
                  : `${entry.attachments.length} pages`}
                {" · "}
                {words} mots lus
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
                sourceOpen && "rotate-180",
              )}
            />
          </button>

          <div
            id="rv-source"
            className={cn("flex-col gap-3", sourceOpen ? "flex" : "hidden md:flex")}
          >
            <p className="hidden items-baseline justify-between gap-3 md:flex">
              <span className="surtitre text-muted-foreground">
                Ce qui est écrit
              </span>
              <span className="text-meta text-muted-foreground">
                {entry.attachments.length === 1
                  ? "1 page"
                  : `${entry.attachments.length} pages`}
                {" · "}
                {words} mots lus
              </span>
            </p>

            <SegmentedControl
              label="Ce qui est écrit"
              value={sourceTab}
              onChange={setSourceTab}
              options={[
                {
                  value: "pages",
                  label: (
                    <>
                      <Images aria-hidden="true" />
                      La page
                    </>
                  ),
                },
                {
                  value: "texte",
                  label: (
                    <>
                      <FileText aria-hidden="true" />
                      Mot à mot
                    </>
                  ),
                },
              ]}
            />

            {sourceTab === "pages" ? (
              <div
                id="rv-panel-pages"
                aria-label="La page"
                className="flex flex-col gap-3"
              >
                {entry.attachments.map((a, i) => (
                  <SourcePage
                    key={a.id}
                    attachment={a}
                    index={i}
                    total={entry.attachments.length}
                    quarter={rotating[a.id] ?? 0}
                    rotating={(rotating[a.id] ?? 0) > 0}
                    onRotate={canEditEntry ? () => rotateAttachment(a.id) : null}
                    removing={removingAttachment === a.id}
                    onRemove={
                      published ? null : () => setConfirmRemoveAttachment(a.id)
                    }
                  />
                ))}
                {entry.attachments.length === 0 && (
                  <p className="text-meta text-muted-foreground">
                    Aucune page n'est attachée à cette journée : le récit a été
                    saisi à la main.
                  </p>
                )}
              </div>
            ) : (
              <div
                id="rv-panel-texte"
                aria-label="Mot à mot"
                className="flex flex-col gap-2"
              >
                <p className="text-meta text-muted-foreground">
                  Ce que Racontine a lu sur le papier, mot à mot. Corrigez ici
                  pour garder la trace exacte du carnet.
                </p>
                <GrowingTextarea
                  id="rv-transcription"
                  aria-label="Transcription intégrale"
                  minLines={8}
                  value={transcription}
                  placeholder="La transcription du carnet…"
                  className="paper-ruled paper-ruled--plain"
                  onChange={(e) => setTranscription(e.target.value)}
                />
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          {pending > 0 && (
            <section aria-labelledby="verif" className="flex flex-col gap-2">
              <h2 id="verif" className="surtitre text-muted-foreground">
                Ce que Racontine a lu
              </h2>
              {uncertainties
                .map((u, i) => ({ u, i }))
                .filter(({ u }) => !u.resolved)
                .map(({ u, i }) =>
                  i === openIndex ? (
                    <UncertaintyCard
                      key={`${u.original}-${i}`}
                      id={`rv-u-${i}`}
                      item={u}
                      phrase={phraseFor(u)}
                      disabled={resolvingIndex !== null || saving !== null}
                      resolving={resolvingIndex === i}
                      onResolve={(value) => resolveUncertainty(i, value)}
                    />
                  ) : (
                    <CollapsedReading
                      key={`${u.original}-${i}`}
                      id={`rv-u-${i}`}
                      item={u}
                      phrase={phraseFor(u)}
                      onOpen={() => setOpenUncertainty(i)}
                    />
                  ),
                )}
            </section>
          )}

          <MomentsGlance items={items} flagged={flaggedValues} />

          {uncertainties.some((u) => u.resolved) && (
            <section aria-label="Lectures validées" className="flex flex-col gap-2">
              {uncertainties
                .map((u, i) => ({ u, i }))
                .filter(({ u }) => !!u.resolved)
                .map(({ u, i }) => (
                  <ResolvedReading
                    key={`${u.original}-${i}`}
                    id={`rv-u-${i}`}
                    item={u}
                    onEdit={() => setFocusField(u.champ ?? "recit")}
                  />
                ))}
            </section>
          )}

          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            className="-mt-3"
          >
            <summary className="tap flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 outline-none transition-colors dur-fast ease-carnet hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-ui font-bold">
                  Corriger les moments
                </span>
                <span className="block text-meta text-muted-foreground">
                  {items.length === 0
                    ? "Ajouter un repas, une sieste, une activité…"
                    : "Modifier, retirer ou ajouter un moment"}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
                  itemsOpen && "rotate-180",
                )}
              />
            </summary>
            <div className="pt-3">
              <ItemEditor
                items={items}
                onField={setItemField}
                onRemove={removeItem}
                onAdd={addItem}
              />
            </div>
          </details>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-title">Titre de la journée</Label>
            <GrowingTextarea
              id="rv-title"
              minLines={1}
              value={title}
              placeholder="Une jolie journée…"
              className="font-serif text-title font-semibold"
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey)
                  e.preventDefault();
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-story">Le récit de la journée</Label>
            <GrowingTextarea
              id="rv-story"
              minLines={5}
              value={story}
              placeholder="Le récit chaleureux que liront les proches…"
              className="paper-ruled paper-ruled--plain"
              onChange={(e) => setStory(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-highlight">
              <Star className="size-4 text-muted-foreground" aria-hidden="true" />
              Temps fort du jour
            </Label>
            <GrowingTextarea
              id="rv-highlight"
              minLines={1}
              value={highlight}
              placeholder="Le moment à retenir…"
              onChange={(e) => setHighlight(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rv-date">Date</Label>
              <Input
                id="rv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rv-source">Lieu</Label>
              <Select
                id="rv-source"
                className="w-full"
                value={source}
                onChange={(e) => setSource(e.target.value as EntrySource)}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-mood">Humeur</Label>
            <Input
              id="rv-mood"
              value={mood}
              placeholder="Joyeuse, un peu fatiguée…"
              onChange={(e) => setMood(e.target.value)}
            />
          </div>

          <SouvenirsEditor
            entryId={entry.id}
            childName={entry.child?.name}
            date={entry.date}
            souvenirs={entry.souvenirs ?? []}
            onChange={(update) =>
              setEntry((prev) =>
                prev
                  ? { ...prev, souvenirs: update(prev.souvenirs ?? []) }
                  : prev,
              )
            }
          />

          {error && (
            <div
              role="alert"
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3",
                errorKind === "stopped"
                  ? "border-warning bg-warning-bg"
                  : "border-destructive bg-destructive-soft",
              )}
            >
              <TriangleAlert
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  errorKind === "stopped" ? "text-warning" : "text-destructive",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-ui font-bold">
                  {errorKind === "stopped"
                    ? "Publication non confirmée"
                    : "La journée n'a pas pu être enregistrée"}
                </p>
                <p className="text-meta text-muted-foreground">
                  {errorKind === "stopped"
                    ? error
                    : `${error} — rien n'est perdu : vos corrections sont toujours à l'écran.`}
                </p>
                {errorKind === "stopped" && (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/">
                      <BookOpenText aria-hidden="true" />
                      Voir l’état dans le journal
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            loading={saving === "draft"}
            disabled={saving !== null}
            onClick={() => save(false)}
          >
            {published
              ? "Enregistrer les modifications"
              : "Enregistrer le brouillon"}
          </Button>
        </div>
      </div>

      <ReviewActionBar
        barRef={barRef}
        saving={saving}
        publishSeconds={publishSeconds}
        moments={items.length}
        pages={entry.attachments.length}
        republish={published}
        pending={pending}
        onStopWaiting={() => publishAbort.current?.abort()}
        onPublish={() => save(true)}
      />

      <LeaveGuardDialog
        open={blocker.state === "blocked"}
        saving={saving === "draft"}
        onDismiss={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        onLeaveAnyway={() => {
          leaving.current = true;
          if (blocker.state === "blocked") blocker.proceed();
        }}
        onSaveThenLeave={async () => {
          if (!(await save(false))) return;
          leaving.current = true;
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />

      <RemovePageDialog
        open={!!confirmRemoveAttachment}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveAttachment(null);
        }}
        onConfirm={() =>
          attachmentToRemove && removeAttachment(attachmentToRemove.id)
        }
      />

    </div>
  );
}
