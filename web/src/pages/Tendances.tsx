import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookHeart,
  ChartNoAxesColumn,
  CloudOff,
  HeartPulse,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Child, TrendPeriod, TrendsResponse } from "@/lib/types";
import { capitalize, dayMonth, formatDuration, fr, fullDate } from "@/lib/format";
import { enfantMemorise, memoriserEnfant } from "@/lib/journal-view";
import { Button } from "@/components/ui/button";
import { ChildMark } from "@/components/ChildMark";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  PageHeader,
  PageShell,
  PageSkeleton,
  PageState,
} from "@/components/PageState";
import { BarList, NapChart } from "@/features/trends/charts";

const PERIODS = [
  { value: "4s", label: "4 semaines" },
  { value: "3m", label: "3 mois" },
  { value: "12m", label: "12 mois" },
] as const;

const PERIOD_SPOKEN: Record<TrendPeriod, string> = {
  "4s": "ces 4 dernières semaines",
  "3m": "ces 3 derniers mois",
  "12m": "ces 12 derniers mois",
};

function borne(date: string, autre: string): string {
  return date.slice(0, 4) === autre.slice(0, 4)
    ? dayMonth(date)
    : `${dayMonth(date)} ${date.slice(0, 4)}`;
}

function isPeriod(v: string | null): v is TrendPeriod {
  return v === "4s" || v === "3m" || v === "12m";
}

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t pt-5">
      <header className="flex flex-col gap-0.5">
        <h2 id={id} className="font-serif text-title font-semibold">
          {title}
        </h2>
        {lede && <p className="text-meta text-muted-foreground">{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function Rien({ children }: { children: React.ReactNode }) {
  return <p className="text-ui text-muted-foreground">{children}</p>;
}

function ChildPicker({
  children,
  value,
  onChange,
}: {
  children: Child[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (children.length < 2) return null;
  return (
    <div
      role="group"
      aria-label="Quel enfant"
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pr-2 pb-1"
    >
      {children.map((c) => (
        <Button
          key={c.id}
          variant={value === c.id ? "default" : "outline"}
          size="sm"
          aria-pressed={value === c.id}
          className="shrink-0 snap-start"
          onClick={() => onChange(c.id)}
        >
          <ChildMark name={c.name} current={value === c.id} />
          {c.name}
        </Button>
      ))}
    </div>
  );
}

export default function Tendances() {
  const [params, setParams] = useSearchParams();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const periodParam = params.get("period");
  const period: TrendPeriod = isPeriod(periodParam) ? periodParam : "4s";

  useEffect(() => {
    api.listChildren().then(setChildren, (e) =>
      setError(e instanceof Error ? e.message : "Erreur inconnue"),
    );
  }, []);

  const childId = useMemo(() => {
    if (!children?.length) return null;
    const wanted = params.get("childId") ?? enfantMemorise();
    return children.some((c) => c.id === wanted) ? wanted! : children[0].id;
  }, [children, params]);

  useEffect(() => {
    if (!childId) return;
    let ignore = false;
    setError(null);
    api.trends(childId, period).then(
      (res) => !ignore && setData(res),
      (e) => !ignore && setError(e instanceof Error ? e.message : "Erreur inconnue"),
    );
    return () => {
      ignore = true;
    };
  }, [childId, period]);

  function choisir(next: { childId?: string; period?: TrendPeriod }) {
    const p = new URLSearchParams(params);
    if (next.childId) {
      memoriserEnfant(next.childId);
      p.set("childId", next.childId);
    }
    if (next.period) p.set("period", next.period);
    setParams(p, { replace: true });
  }

  const ready =
    data && childId && data.child.id === childId && data.period === period;
  const t = ready ? data.trends : null;
  const appetitMentions = t
    ? t.appetite.levels.reduce((a, l) => a + l.count, 0)
    : 0;

  return (
    <PageShell className="lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
      <PageHeader
        title="Tendances"
        tone="nap"
        lede="Ce que racontent les journées publiées, mises bout à bout."
      />

      {children && childId && (
        <div className="flex flex-col gap-3">
          <ChildPicker
            children={children}
            value={childId}
            onChange={(id) => choisir({ childId: id })}
          />
          <SegmentedControl
            label="Période"
            value={period}
            options={PERIODS}
            onChange={(p) => choisir({ period: p })}
          />
        </div>
      )}

      {error && (
        <PageState icon={CloudOff} tone="error" title="Les tendances n’ont pas pu venir">
          {error}
        </PageState>
      )}

      {!error && children && children.length === 0 && (
        <PageState icon={ChartNoAxesColumn} title="Pas encore de carnet">
          Les tendances apparaîtront dès les premières journées publiées.
        </PageState>
      )}

      {!error && !t && children?.length !== 0 && (
        <PageSkeleton label="On relit les journées" rows={2} />
      )}

      {!error && t && data && (
        <>
          <p className="text-ui text-muted-foreground" data-tabular>
            {t.days === 0
              ? `Aucune journée publiée ${PERIOD_SPOKEN[period]}.`
              : `${t.days} journée${t.days > 1 ? "s" : ""} publiée${t.days > 1 ? "s" : ""} ${PERIOD_SPOKEN[period]}, du ${borne(t.range.from, t.range.to)} au ${borne(t.range.to, t.range.from)}.`}
          </p>

          <Section
            id="t-sieste"
            title="La sieste"
            lede={
              t.naps.averageMinutes !== null ? (
                <>
                  En moyenne{" "}
                  <strong className="font-bold text-foreground" data-tabular>
                    {formatDuration(t.naps.averageMinutes)}
                  </strong>{" "}
                  par jour, sur {t.naps.days} jour{t.naps.days > 1 ? "s" : ""}{" "}
                  aux heures notées.
                </>
              ) : undefined
            }
          >
            {t.naps.days > 0 ? (
              <NapChart weeks={t.naps.weeks} />
            ) : (
              <Rien>Aucune sieste avec ses heures de début et de fin.</Rien>
            )}
          </Section>

          <Section
            id="t-appetit"
            title="L’appétit aux repas"
            lede={
              t.appetite.unspecified > 0
                ? `${t.appetite.unspecified} repas sans mention d’appétit ne sont pas comptés.`
                : undefined
            }
          >
            {appetitMentions > 0 ? (
              <BarList
                label="Mentions d’appétit, par repas"
                tone="meal"
                unit={() => "repas"}
                rows={t.appetite.levels
                  .filter((l) => l.level !== "autre" || l.count > 0)
                  .map((l) => ({ key: l.level, label: l.label, count: l.count }))}
              />
            ) : (
              <Rien>Aucun repas n’a de mention d’appétit sur cette période.</Rien>
            )}
          </Section>

          <Section id="t-activites" title="Les activités les plus fréquentes">
            {t.activities.length > 0 ? (
              <BarList
                label="Activités, par nombre de fois"
                tone="activity"
                unit={() => "fois"}
                rows={t.activities.map((a) => ({
                  key: a.label,
                  label: fr(a.label),
                  count: a.count,
                }))}
              />
            ) : (
              <Rien>Aucune activité notée sur cette période.</Rien>
            )}
          </Section>

          <Section
            id="t-sante"
            title="Santé"
            lede="Dans l’ordre des jours, pour en parler au médecin."
          >
            {t.health.length > 0 ? (
              <ol className="flex flex-col divide-y border-y">
                {t.health.map((h, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    <HeartPulse
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-health"
                    />
                    <p className="text-ui">
                      <time
                        dateTime={h.date}
                        className="block text-meta font-bold text-muted-foreground"
                      >
                        {capitalize(fullDate(h.date))}
                      </time>
                      {fr(h.note)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <Rien>Rien à signaler côté santé sur cette période.</Rien>
            )}
          </Section>

          <Section id="t-anecdotes" title="Anecdotes récentes">
            {t.anecdotes.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {t.anecdotes.map((a, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Sparkles
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-anecdote"
                    />
                    <p className="measure text-body">
                      <time
                        dateTime={a.date}
                        className="block text-meta text-muted-foreground"
                      >
                        {capitalize(dayMonth(a.date))}
                      </time>
                      {fr(a.text)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Rien>Pas d’anecdote sur cette période.</Rien>
            )}
          </Section>

          <Section
            id="t-livre"
            title="Le livre de l’année"
            lede={`Toutes les journées publiées de ${data.child.name}, mises en page pour l’impression.`}
          >
            {data.years.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {data.years.map((y) => (
                  <li key={y}>
                    <Button asChild variant="outline">
                      <Link to={`/livre?childId=${data.child.id}&annee=${y}`}>
                        <BookHeart aria-hidden="true" />
                        Le livre {y}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Rien>Le livre se remplira avec les journées publiées.</Rien>
            )}
          </Section>
        </>
      )}
    </PageShell>
  );
}
