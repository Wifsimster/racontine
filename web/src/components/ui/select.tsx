import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/input";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select
        data-slot="select"
        className={cn(
          fieldBase,
          "peer h-11 w-full cursor-pointer appearance-none py-2 pl-4 pr-11",
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </span>
  );
}

export { Select };
