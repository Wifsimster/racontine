import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Segment<T extends string> = {
  value: T;
  label: ReactNode;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly Segment<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-stretch gap-1 rounded-full bg-card p-1 shadow-card ring-1 ring-border",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(o.value);
            }}
            className={cn(
              "relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-ui font-bold transition-colors dur-fast outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
