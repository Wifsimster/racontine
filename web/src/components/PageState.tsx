import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("shell-width flex flex-col gap-6 px-4 pt-4 pb-8", className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  lede,
}: {
  title: string;
  lede?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-serif text-display font-semibold">{title}</h1>
      {lede && (
        <p className="max-w-[46ch] text-ui text-pretty text-muted-foreground">
          {lede}
        </p>
      )}
    </header>
  );
}

export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("surtitre text-muted-foreground", className)}
      {...props}
    />
  );
}

const TONE = {
  neutral: "bg-muted text-muted-foreground",
  locked: "bg-primary-soft text-primary",
  error: "bg-destructive-soft text-destructive",
} as const;

export function PageState({
  icon: Icon,
  tone = "neutral",
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONE;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      role={tone === "error" ? "alert" : undefined}
      className="rise-enter flex min-h-[calc(100svh-16rem)] flex-col items-center justify-center gap-5 text-center"
    >
      <span
        aria-hidden="true"
        className={cn("grid size-16 place-items-center rounded-3xl", TONE[tone])}
      >
        <Icon className="size-7" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          {title}
        </h2>
        {children && (
          <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
            {children}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-3">{actions}</div>
      )}
    </section>
  );
}

export function PageSkeleton({
  label = "On ouvre le carnet",
  slowLabel = "Le carnet met du temps à venir",
  rows = 2,
}: {
  label?: string;
  slowLabel?: string;
  rows?: number;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-11 items-end justify-between gap-3 border-b pb-2">
        <p role="status" className="surtitre text-muted-foreground">
          {slow ? slowLabel : label}
        </p>
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="rounded-2xl border bg-card p-5 shadow-card"
        >
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-5 w-44" />
          <div className="skeleton mt-4 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function InlineError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl bg-destructive-soft px-3 py-2 text-meta text-destructive",
        className,
      )}
    >
      {children}
    </p>
  );
}
