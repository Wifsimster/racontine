import { cn } from "@/lib/utils";

const TONE = {
  primary: "text-primary",
  nap: "text-nap",
  activity: "text-activity",
  anecdote: "text-anecdote",
  meal: "text-meal",
} as const;

export type TitreTone = keyof typeof TONE;

export function splitAccent(title: string): [string, string] {
  const space = title.lastIndexOf(" ");
  if (space > 0) return [title.slice(0, space + 1), title.slice(space + 1)];
  const apostrophe = Math.max(title.indexOf("'"), title.indexOf("’"));
  if (apostrophe > 0 && apostrophe < title.length - 1)
    return [title.slice(0, apostrophe + 1), title.slice(apostrophe + 1)];
  return ["", title];
}

export function Spark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 22 20"
      className={cn("inline-block h-[0.6em] w-[0.7em] text-spark", className)}
    >
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <path d="M3 16 L12 11" />
        <path d="M7 3 L16 7" />
      </g>
    </svg>
  );
}

export function TitreCarnet({
  title,
  accent,
  tone = "primary",
  as: Tag = "h1",
  spark = true,
  className,
}: {
  title: string;
  accent?: string;
  tone?: TitreTone;
  as?: "h1" | "h2";
  spark?: boolean;
  className?: string;
}) {
  const [lead, word] =
    accent && title.endsWith(accent)
      ? [title.slice(0, title.length - accent.length), accent]
      : splitAccent(title);
  return (
    <Tag className={cn("titre-carnet text-foreground", className)}>
      {lead}
      <span className={cn("titre-accent", TONE[tone])}>{word}</span>
      {spark && (
        <>
          {" "}
          <Spark className="-translate-y-[0.15em]" />
        </>
      )}
    </Tag>
  );
}
