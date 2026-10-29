import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "current" | "todo" | "failed";

export type Step = {
  key: string;
  label: string;
  state: StepState;
};

const SPOKEN: Record<StepState, string> = {
  done: "terminé",
  current: "en cours",
  todo: "à venir",
  failed: "échoué",
};

export function CaptureSteps({
  steps,
  className,
}: {
  steps: Step[];
  className?: string;
}) {
  return (
    <ol
      aria-label="Les étapes de la journée"
      className={cn("flex items-start", className)}
    >
      {steps.map((step, i) => {
        const linkDone = i > 0 && steps[i - 1].state === "done";
        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-1"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-[13px] right-1/2 h-0.5 w-full rounded-full transition-colors dur-slow ease-carnet",
                  linkDone ? "bg-foreground" : "bg-border",
                )}
              />
            )}

            <span
              className={cn(
                "relative z-10 grid size-7 place-items-center rounded-full transition-colors dur-slow ease-carnet",
                step.state === "done" && "bg-foreground text-background",
                step.state === "current" &&
                  "border-2 border-foreground bg-card",
                step.state === "failed" &&
                  "border-2 border-destructive bg-destructive-soft text-destructive",
                step.state === "todo" && "border-2 border-input bg-card",
              )}
              role="img"
              aria-label={SPOKEN[step.state]}
            >
              {step.state === "done" && <Check className="size-4" />}
              {step.state === "current" && (
                <span className="size-2 rounded-full bg-foreground" />
              )}
              {step.state === "failed" && <TriangleAlert className="size-4" />}
            </span>

            <span
              className={cn(
                "min-h-4 text-center text-xs",
                step.state === "current"
                  ? "font-bold text-foreground"
                  : step.state === "failed"
                    ? "font-bold text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
