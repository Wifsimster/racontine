import { initialOf } from "@/lib/child";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "size-5 rounded-sm text-overline tracking-normal",
  md: "size-11 rounded-md text-title tracking-normal",
} as const;

export function ChildMark({
  name,
  size = "sm",
  current = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZE;
  current?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center font-serif font-semibold",
        current ? "bg-primary-soft text-primary" : "bg-muted text-foreground",
        SIZE[size],
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
