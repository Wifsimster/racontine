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
      className={cn("inline-flex items-stretch gap-4", className)}
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
              "relative inline-flex min-h-11 items-center gap-1.5 rounded-md text-ui transition-colors dur-fast outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4",
              "after:absolute after:inset-x-0 after:bottom-1.5 after:h-0.5 after:rounded-full after:transition-colors after:dur-fast",
              active
                ? "font-bold text-foreground after:bg-primary"
                : "text-muted-foreground after:bg-transparent hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
