import { ArrowLeft, Inbox, MailCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldId, type Problem, PROBLEM_ID } from "./problems";

export const SHEET =
  "relative mt-7 -ml-4 flex flex-col gap-5 rounded-r-2xl border border-l-0 bg-card p-5 pl-4 shadow-card";

export function MargeRule() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-[1.5px]"
      style={{ background: "var(--rule-margin)" }}
    />
  );
}

export function SheetTitle({
  icon: Icon,
  title,
  tone = "neutral",
  id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: "neutral" | "done";
  id?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
          tone === "done"
            ? "bg-success-bg text-success"
            : "bg-muted text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <h2 id={id} className="font-serif text-title font-semibold">
        {title}
      </h2>
    </div>
  );
}

export function WaitBar({ label }: { label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuetext="Demande envoyée — réponse attendue"
      className="flex h-1 gap-1"
    >
      <div className="h-full flex-1 rounded-full bg-primary" />
      <div className="h-full flex-1 rounded-full bg-input" />
    </div>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  hint,
  invalid,
  hold,
  ...rest
}: {
  id: FieldId;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  invalid?: boolean;
  hold: React.RefObject<Partial<Record<FieldId, HTMLInputElement | null>>>;
} & Omit<React.ComponentProps<"input">, "onChange" | "value" | "id" | "ref">) {
  const described = [hint ? `${id}-hint` : null, invalid ? PROBLEM_ID : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={(el) => {
          hold.current[id] = el;
        }}
        className="rounded-md bg-background focus-visible:bg-background"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={described || undefined}
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-meta text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ProblemNote({
  problem,
  ref,
}: {
  problem: Problem;
  ref: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      id={PROBLEM_ID}
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-3 rounded-r-xl rounded-l-sm border-l-4 border-l-destructive bg-destructive-soft p-4"
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-ui font-bold text-balance text-foreground">
          {problem.cause}
        </p>
        <p className="text-meta text-foreground">{problem.remedy}</p>
      </div>
    </div>
  );
}

export function LinkSent({
  kind,
  email,
  resent,
  busy,
  onResend,
  onChange,
}: {
  kind: "magic" | "forgot";
  email: string;
  resent: boolean;
  busy: boolean;
  onResend: () => void;
  onChange: () => void;
}) {
  return (
    <div role="status" className={SHEET}>
      <MargeRule />
      <SheetTitle icon={MailCheck} title="Le lien est parti" tone="done" />

      <p className="carnet-story text-foreground">
        {kind === "forgot"
          ? "Ouvrez-le depuis cet appareil : il vous mènera au choix d’un nouveau mot de passe. Passé une heure, il ne vaut plus rien."
          : "Ouvrez-le depuis cet appareil : il vous connecte au journal, sans mot de passe."}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-meta text-muted-foreground">
          Envoyé à <span className="font-bold text-foreground">{email}</span>
          {kind === "forgot" && ", si un compte y est ouvert"}
          {resent && " · renvoyé à l’instant"}
        </p>
        <p className="flex items-start gap-2 text-meta text-muted-foreground">
          <Inbox className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {"Rien reçu au bout d’une minute ? Regardez dans les courriers indésirables."}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full aria-disabled:cursor-progress aria-disabled:hover:bg-card"
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
          onClick={onResend}
        >
          {busy ? "Envoi…" : "Renvoyer le lien"}
        </Button>
        {busy && <WaitBar label="Envoi du lien…" />}
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={onChange}
        >
          <ArrowLeft aria-hidden="true" />
          {"Corriger l’adresse"}
        </Button>
      </div>
    </div>
  );
}

