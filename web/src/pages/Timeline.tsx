import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Camera } from "lucide-react";
import { api } from "@/lib/api";
import { canWrite, roleMap } from "@/lib/access";
import { useBilling } from "@/lib/billing";
import { BillingCallout } from "@/features/billing/parts";
import {
  type AttachmentRef,
  type Child,
  type Entry,
  type JournalMonth,
  type MemberRole,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EntryCard } from "@/features/journal/EntryCard";
import { EntryRow } from "@/features/journal/EntryRow";
import {
  ChildFilter,
  ModeToggle,
  MonthJump,
  MonthJumpVeil,
} from "@/features/journal/browse";
import { PageViewer } from "@/features/journal/pages";
import {
  JournalEmpty,
  JournalError,
  JournalFiltered,
  JournalSkeleton,
  Receipt,
  readFlash,
  type Flash,
} from "@/features/journal/states";
import { capitalize, lastDayOfMonth, monthYear } from "@/lib/format";
import {
  enfantMemorise,
  filMemorise,
  memoriserEnfant,
  memoriserFil,
  memoriserMode,
  modeMemorise,
  oublierFil,
  type JournalMode,
} from "@/lib/journal-view";
import { useDefilementDescendant } from "@/lib/scroll";

const PAGE = 20;






type Viewer = { pages: AttachmentRef[]; index: number; date: string };

export default function Timeline() {
  const location = useLocation();
  const { billing } = useBilling();

  const [childId, setChildId] = useState<string | null>(() => enfantMemorise());
  const [from, setFrom] = useState<string | null>(null);
  const [mode, setMode] = useState<JournalMode>(() => modeMemorise());
  const [children, setChildren] = useState<Child[]>([]);
  const [months, setMonths] = useState<JournalMonth[]>([]);
  const [moisOuvert, setMoisOuvert] = useState<string | null>(null);

  const [repris] = useState(() => filMemorise(enfantMemorise()));
  const [entries, setEntries] = useState<Entry[]>(repris?.entries ?? []);
  const [cursor, setCursor] = useState<string | null>(repris?.nextCursor ?? null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    repris ? "ready" : "loading",
  );
  const [error, setError] = useState<string>("");
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [roleByChild, setRoleByChild] = useState<Map<string, MemberRole> | null>(
    null,
  );
  const openerRef = useRef<HTMLElement | null>(null);
  const [flash, setFlash] = useState<Flash | null>(() => {
    const recu = readFlash(location.state);
    if (recu) oublierFil();
    return recu;
  });
  useEffect(() => {
    if (!location.state) return;
    const h = window.history.state as Record<string, unknown> | null;
    window.history.replaceState({ ...(h ?? {}), usr: null }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void api.listChildren().then(
      (list) => {
        setChildren(list);
        setRoleByChild(roleMap(list));
      },
      () => setRoleByChild(null),
    );
  }, []);

  useEffect(() => {
    let ignore = false;
    void api.timelineMonths(childId).then(
      (res) => !ignore && setMonths(res.months),
      () => !ignore && setMonths([]),
    );
    return () => {
      ignore = true;
    };
  }, [childId]);

  const cadrage = useRef(0);

  const ouvrir = useCallback(
    async (child: string | null, depuis: string | null) => {
      const mine = cadrage.current;
      const res = await api.timeline({
        childId: child,
        from: depuis,
        limit: PAGE,
      });
      if (mine !== cadrage.current) return;
      setEntries(res.entries);
      setCursor(res.nextCursor);
      setPhase("ready");
    },
    [],
  );

  const rafraichir = useCallback(async () => {
    const mine = cadrage.current;
    const res = await api.timeline({ childId, from, limit: PAGE });
    if (mine !== cadrage.current) return;
    setEntries((prev) => {
      if (!prev.length) {
        setCursor(res.nextCursor);
        return res.entries;
      }
      const fresh = new Map(res.entries.map((e) => [e.id, e]));
      const merged = prev.map((e) => fresh.get(e.id) ?? e);
      const known = new Set(prev.map((e) => e.id));
      const added = res.entries.filter((e) => !known.has(e.id));
      return added.length ? [...added, ...merged] : merged;
    });
  }, [childId, from]);

  useEffect(() => {
    cadrage.current += 1;
    const cache = filMemorise(childId);

    if (cache && cache.from === from && cache.entries.length > 0) {
      setEntries(cache.entries);
      setCursor(cache.nextCursor);
      setPhase("ready");
      void rafraichir().catch(() => {});
      return;
    }

    let ignore = false;
    setEntries([]);
    setCursor(null);
    setPhase("loading");
    setMoreError("");
    ouvrir(childId, from).catch((e) => {
      if (ignore) return;
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    });
    return () => {
      ignore = true;
    };
  }, [childId, from, ouvrir, rafraichir]);

  useEffect(() => {
    if (phase !== "ready") return;
    memoriserFil(childId, { entries, nextCursor: cursor, from });
  }, [phase, childId, entries, cursor, from]);

  const reload = useCallback(() => {
    cadrage.current += 1;
    setError("");
    setPhase("loading");
    setEntries([]);
    setCursor(null);
    oublierFil();
    ouvrir(childId, from).catch((e) => {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    });
  }, [childId, from, ouvrir]);

  const reading = entries.some((e) => e.status === "processing");

  useEffect(() => {
    if (phase !== "ready" || !reading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) {
        try {
          await rafraichir();
        } catch {
        }
      }
      if (alive) timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 4000);
    const wake = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [phase, reading, rafraichir]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const mine = cadrage.current;
    setMore(true);
    setMoreError("");
    try {
      const res = await api.timeline({ childId, from, cursor, limit: PAGE });
      if (mine !== cadrage.current) return;
      let ajoutees = 0;
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const nouvelles = res.entries.filter((e) => !seen.has(e.id));
        ajoutees = nouvelles.length;
        return nouvelles.length ? [...prev, ...nouvelles] : prev;
      });
      setCursor(ajoutees === 0 ? null : res.nextCursor);
    } catch (e) {
      if (mine !== cadrage.current) return;
      setMoreError(
        e instanceof Error
          ? e.message
          : "Les journées précédentes n'ont pas pu être chargées.",
      );
    } finally {
      setMore(false);
    }
  }, [childId, from, cursor]);

  const sentinelle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelle.current;
    if (!el || !cursor || more || phase !== "ready") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, more, phase, loadMore]);

  function choisirEnfant(id: string | null) {
    if (id === childId) return;
    memoriserEnfant(id);
    setChildId(id);
    setFrom(null);
    setMoisOuvert(null);
    window.scrollTo({ top: 0 });
  }

  function choisirMode(m: JournalMode) {
    memoriserMode(m);
    setMode(m);
  }

  function sauterAuMois(month: string | null) {
    setMoisOuvert(null);
    setFrom(month ? lastDayOfMonth(month) : null);
    window.scrollTo({ top: 0 });
  }

  function openPages(entry: Entry, index: number, depuis: HTMLElement) {
    openerRef.current = depuis;
    setViewer({ pages: entry.attachments, index, date: entry.date });
  }

  function closeViewer() {
    setViewer(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  const groupes = useMemo(() => {
    const groups: { key: string; label: string; entries: Entry[] }[] = [];
    for (const e of entries) {
      const key = e.date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else
        groups.push({
          key,
          label: monthYear(e.date),
          entries: [e],
        });
    }
    return groups;
  }, [entries]);

  const hasJournal = phase === "ready" && entries.length > 0;

  const moisActif = from ? from.slice(0, 7) : null;

  const cadre = (() => {
    const enfant = childId
      ? (children.find((c) => c.id === childId)?.name ?? null)
      : null;
    const mois = moisActif ? capitalize(monthYear(`${moisActif}-01`)) : null;
    if (enfant && mois) return `${enfant}, ${mois.toLowerCase()}`;
    if (enfant) return `le carnet de ${enfant}`;
    if (mois) return mois.toLowerCase();
    return null;
  })();

  function toutRevoir() {
    choisirEnfant(null);
    setFrom(null);
  }

  const descend = useDefilementDescendant();

  const canCapture =
    roleByChild === null ||
    [...roleByChild.values()].some((r) => canWrite(r)) ||
    roleByChild.size === 0;

  const carnetOuvert = billing?.access.open !== false;

  const sellable =
    roleByChild !== null &&
    (roleByChild.size === 0 ||
      [...roleByChild.values()].some((r) => canWrite(r)));

  return (
    <div className="shell-width flex flex-col gap-4 px-4 pt-4 pb-8">
      <header>
        <h1 className="font-serif text-display font-semibold">Le journal</h1>
      </header>

      {flash && <Receipt flash={flash} onClose={() => setFlash(null)} />}

      {billing && sellable && <BillingCallout billing={billing} />}

      {phase === "ready" && (children.length > 1 || hasJournal) && (
        <div className="flex items-center justify-between gap-3">
          <ChildFilter
            children={children}
            value={childId}
            onChange={choisirEnfant}
          />
          {hasJournal && (
            <div className="shrink-0">
              <ModeToggle value={mode} onChange={choisirMode} />
            </div>
          )}
        </div>
      )}

      {phase === "loading" && <JournalSkeleton />}

      {phase === "error" && (
        <JournalError
          message={error}
          canCapture={canCapture}
          onRetry={reload}
        />
      )}

      {phase === "ready" && entries.length === 0 && !cadre && (
        <JournalEmpty canCapture={canCapture} carnetOuvert={carnetOuvert} />
      )}

      {phase === "ready" && entries.length === 0 && cadre && (
        <JournalFiltered label={cadre} onReset={toutRevoir} />
      )}

      {phase === "ready" &&
        groupes.map((m) => (
          <section key={m.key} aria-label={m.label}>
            <div
              className={cn(
                "sticky top-header -mx-4 bg-surface-bar px-4 backdrop-blur-md",
                moisOuvert === m.key ? "z-40" : "z-10",
              )}
            >
              <div className="relative flex h-11 items-stretch justify-between gap-3 border-b">
                <MonthJump
                  id={`mois-${m.key}`}
                  months={months}
                  current={m.key}
                  active={moisActif}
                  open={moisOuvert === m.key}
                  onOpen={() => setMoisOuvert(m.key)}
                  onClose={() => setMoisOuvert(null)}
                  onJump={sauterAuMois}
                />
                <p
                  className="surtitre self-end pb-2 text-muted-foreground"
                  data-tabular
                >
                  {m.entries.length} journée{m.entries.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <ol
              className={cn(
                "mt-4 flex flex-col",
                mode === "lire" ? "gap-4" : "gap-1.5",
              )}
            >
              {m.entries.map((e) => (
                <li key={e.id}>
                  {mode === "lire" ? (
                    <EntryCard
                      entry={e}
                      canEdit={canWrite(roleByChild?.get(e.childId))}
                      onOpenPages={openPages}
                    />
                  ) : (
                    <EntryRow entry={e} />
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}

      {moreError && (
        <p className="rounded-lg bg-destructive-soft px-4 py-3 text-meta text-destructive">
          {moreError}
        </p>
      )}

      {hasJournal && cursor !== null && (
        <>
          <div ref={sentinelle} aria-hidden="true" className="h-px" />
          <Button variant="outline" loading={more} onClick={() => void loadMore()}>
            Voir les journées précédentes
          </Button>
        </>
      )}

      {hasJournal && (
        <p
          className={cn(
            "surtitre pt-2 text-center text-muted-foreground",
            canCapture && carnetOuvert ? "pb-32" : "pb-2",
          )}
        >
          {entries.length} journée{entries.length > 1 ? "s" : ""} dans le carnet
        </p>
      )}

      {hasJournal && canCapture && carnetOuvert && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-background via-surface-bar to-transparent px-4 pt-8 pb-safe-6",
            "transition-transform dur-slow ease-page focus-within:translate-y-0",
            descend && "translate-y-[130%]",
          )}
        >
          <Button
            asChild
            size="lg"
            className="action-width pointer-events-auto shadow-lift"
          >
            <Link to="/capture">
              <Camera aria-hidden="true" />
              Photographier le carnet
            </Link>
          </Button>
        </div>
      )}

      {moisOuvert && <MonthJumpVeil onClose={() => setMoisOuvert(null)} />}

      {viewer && (
        <PageViewer
          pages={viewer.pages}
          index={viewer.index}
          date={viewer.date}
          onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
