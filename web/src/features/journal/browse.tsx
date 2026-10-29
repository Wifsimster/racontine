import { useEffect, useRef } from "react";
import { CalendarDays, Check, ChevronDown, Rows3, X } from "lucide-react";
import type { Child, JournalMonth } from "@/lib/types";
import type { JournalMode } from "@/lib/journal-view";
import { ChildMark } from "@/components/ChildMark";
import { Button } from "@/components/ui/button";
import { capitalize, monthYear } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ChildFilter({
  children,
  value,
  onChange,
}: {
  children: Child[];
  value: string | null;
  onChange: (childId: string | null) => void;
}) {
  if (children.length < 2) return null;
  return (
    <div
      role="group"
      aria-label="Quel carnet lire"
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pr-2 pb-1"
    >
      <Button
        variant={value === null ? "default" : "outline"}
        size="sm"
        aria-pressed={value === null}
        className="shrink-0 snap-start"
        onClick={() => onChange(null)}
      >
        Tous
      </Button>
      {children.map((c) => (
        <Button
          key={c.id}
          variant={value === c.id ? "default" : "outline"}
          size="sm"
          aria-pressed={value === c.id}
          className="shrink-0 snap-start"
          onClick={() => onChange(c.id)}
        >
          <ChildMark name={c.name} current={value === c.id} />
          {c.name}
        </Button>
      ))}
    </div>
  );
}

export function ModeToggle({
  value,
  onChange,
}: {
  value: JournalMode;
  onChange: (mode: JournalMode) => void;
}) {
  const parcourt = value === "parcourir";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onChange(parcourt ? "lire" : "parcourir")}
    >
      <Rows3 aria-hidden="true" />
      {parcourt ? "Lire" : "Parcourir"}
    </Button>
  );
}

export function MonthJump({
  id,
  months,
  current,
  active,
  open,
  onOpen,
  onClose,
  onJump,
}: {
  id?: string;
  months: JournalMonth[];
  current: string | null;
  active: string | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onJump: (month: string | null) => void;
}) {
  const boutonRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
      boutonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panneauRef.current?.focus();
  }, [open]);

  const label = current ? capitalize(monthYear(`${current}-01`)) : "Le carnet";

  return (
    <>
      <h2 id={id} className="relative z-40 flex">
        <button
          ref={boutonRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={open ? onClose : onOpen}
          className="-ml-1 flex h-full items-end gap-1.5 rounded-lg px-1 pb-2 transition-colors dur-fast hover:bg-accent"
        >
          <span className="surtitre text-muted-foreground">{label}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </h2>

      {open && (
        <>
          <div
            ref={panneauRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Aller à un mois du carnet"
            className="panel-down absolute inset-x-0 top-full z-40 mt-1"
          >
            <div className="max-h-[60svh] overflow-y-auto rounded-2xl border bg-popover p-2 text-popover-foreground shadow-lift">
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <p className="surtitre text-muted-foreground">
                  {months.length} mois de carnet
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fermer la liste des mois"
                  onClick={onClose}
                >
                  <X />
                </Button>
              </div>

              {active && (
                <button
                  type="button"
                  onClick={() => onJump(null)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors dur-fast hover:bg-accent"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-ui font-bold">
                    Les journées les plus récentes
                  </span>
                </button>
              )}

              <ul>
                {months.map((m) => {
                  const ici = m.month === (active ?? current);
                  return (
                    <li key={m.month}>
                      <button
                        type="button"
                        aria-current={ici ? "true" : undefined}
                        onClick={() => onJump(m.month)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors dur-fast hover:bg-accent aria-[current]:bg-primary-soft"
                      >
                        <span className="min-w-0 flex-1 truncate text-ui font-bold">
                          {capitalize(monthYear(`${m.month}-01`))}
                        </span>
                        <span
                          className="shrink-0 text-meta text-muted-foreground"
                          data-tabular
                        >
                          {m.count} journée{m.count > 1 ? "s" : ""}
                        </span>
                        {ici && (
                          <Check
                            className="size-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {months.length === 0 && (
                <p className="px-2 py-3 text-meta text-muted-foreground">
                  Le carnet n'a pas encore de mois à parcourir.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function MonthJumpVeil({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30 bg-overlay"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}
