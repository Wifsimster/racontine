import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldBase = [
  "min-w-0 rounded-xl border border-input bg-card text-body text-foreground shadow-card",
  "placeholder:text-muted-foreground",
  "transition-[color,background-color,border-color,box-shadow] dur-chip ease-carnet",
  "focus-visible:border-ring focus-visible:bg-primary-soft",
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
  "aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)]",
].join(" ");

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        "flex h-11 w-full px-4 py-2",
        "file:mr-3 file:inline-flex file:border-0 file:bg-transparent file:text-ui file:font-bold file:text-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
