import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldBase,
        "carnet-story flex min-h-28 w-full resize-y px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
