import { useEffect, useId, useRef, useState } from "react";
import type { NapWeek } from "@/lib/types";
import { dayMonth, dayMonthShort, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function topRoundedBar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}

const HEIGHT = 216;
const PAD_TOP = 52;
const PAD_BOTTOM = 28;
const PAD_LEFT = 40;

export function NapChart({ weeks }: { weeks: NapWeek[] }) {
  const titleId = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(60, ...weeks.map((w) => w.averageMinutes ?? 0));
  const ceilHours = Math.ceil(max / 60);
  const step = ceilHours > 4 ? 2 : 1;
  const top = Math.ceil(ceilHours / step) * step * 60;
  const plotW = Math.max(0, width - PAD_LEFT);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = weeks.length ? plotW / weeks.length : 0;
  const gap = 2;
  const barW = Math.max(2, Math.min(40, slot - gap));
  const yOf = (min: number) => PAD_TOP + plotH - (min / top) * plotH;
  const ticks = Array.from({ length: top / 60 / step + 1 }, (_, i) => i * step * 60);
  const labelEvery = Math.max(1, Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 64))));
  const active = hover !== null ? weeks[hover] : null;

  return (
    <figure className="flex flex-col gap-2">
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            role="img"
            aria-labelledby={titleId}
            width={width}
            height={HEIGHT}
            className="block overflow-visible"
            onMouseLeave={() => setHover(null)}
          >
            <title id={titleId}>
              Sieste moyenne par jour, semaine par semaine
            </title>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD_LEFT}
                  x2={width}
                  y1={yOf(t)}
                  y2={yOf(t)}
                  className={t === 0 ? "stroke-border" : "stroke-rule"}
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : "2 4"}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={yOf(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-xs"
                  data-tabular
                >
                  {t / 60}&nbsp;h
                </text>
              </g>
            ))}
            {weeks.map((w, i) => {
              const x = PAD_LEFT + i * slot + (slot - barW) / 2;
              const v = w.averageMinutes;
              return (
                <g key={w.weekStart}>
                  {v !== null && v > 0 && (
                    <path
                      d={topRoundedBar(x, yOf(v), barW, yOf(0) - yOf(v), 4)}
                      className={cn(
                        "fill-nap transition-opacity dur-fast",
                        hover !== null && hover !== i && "opacity-40",
                      )}
                    />
                  )}
                  {v === null && (
                    <line
                      x1={x + barW / 2 - 3}
                      x2={x + barW / 2 + 3}
                      y1={yOf(0) - 3}
                      y2={yOf(0) - 3}
                      className="stroke-muted-foreground"
                      strokeWidth={1}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text
                      x={PAD_LEFT + i * slot + slot / 2}
                      y={HEIGHT - 8}
                      textAnchor="middle"
                      className="fill-muted-foreground text-xs"
                    >
                      {dayMonthShort(w.weekStart)}
                    </text>
                  )}
                  <rect
                    x={PAD_LEFT + i * slot}
                    y={PAD_TOP}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {active && hover !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-meta whitespace-nowrap text-popover-foreground shadow-lift"
            style={{
              top: 0,
              left: Math.min(
                Math.max(PAD_LEFT + hover * slot + slot / 2, 70),
                width - 70,
              ),
            }}
          >
            <p className="text-muted-foreground">
              Semaine du {dayMonth(active.weekStart)}
            </p>
            <p className="font-bold" data-tabular>
              {active.averageMinutes !== null
                ? `${formatDuration(active.averageMinutes)} par jour`
                : "pas de sieste mesurée"}
            </p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Sieste moyenne par jour, semaine par semaine</caption>
        <thead>
          <tr>
            <th scope="col">Semaine du</th>
            <th scope="col">Sieste moyenne</th>
            <th scope="col">Jours mesurés</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <th scope="row">{dayMonth(w.weekStart)}</th>
              <td>
                {w.averageMinutes !== null
                  ? formatDuration(w.averageMinutes)
                  : "non mesurée"}
              </td>
              <td>{w.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function BarList({
  label,
  rows,
  tone,
  unit,
}: {
  label: string;
  rows: { key: string; label: string; count: number }[];
  tone: "meal" | "activity";
  unit: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <table className="w-full border-collapse text-ui">
      <caption className="sr-only">{label}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Libellé</th>
          <th scope="col">Nombre</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="align-middle">
            <th
              scope="row"
              className="w-[40%] py-1.5 pr-3 text-left font-normal text-foreground"
            >
              {r.label}
            </th>
            <td className="py-1.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-3 min-w-[2px] rounded-r-[4px]",
                    tone === "meal" ? "bg-meal" : "bg-activity",
                    r.count === 0 && "bg-border",
                  )}
                  style={{ width: `${(r.count / max) * 70}%` }}
                />
                <span className="shrink-0 text-meta" data-tabular>
                  <span className="font-bold">{r.count}</span>
                  <span className="text-muted-foreground">
                    {total > 0 && tone === "meal"
                      ? ` · ${Math.round((r.count / total) * 100)}${" "}%`
                      : ""}
                    <span className="sr-only"> {unit(r.count)}</span>
                  </span>
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
