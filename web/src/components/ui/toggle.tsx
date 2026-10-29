import { cn } from "@/lib/utils";

export function Toggle({
  checked,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-grid size-11 shrink-0 place-items-center rounded-xl",
        "transition-colors dur-fast hover:bg-accent",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex h-6 w-11 items-center rounded-full transition-colors dur-fast",
          disabled ? "bg-muted" : checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-card shadow-card",
            "transition-transform dur-fast ease-carnet",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
