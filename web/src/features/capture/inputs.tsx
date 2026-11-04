import { useState } from "react";
import { Baby, Camera, Check, ChevronDown, X } from "lucide-react";
import { type Child, type EntrySource, SOURCE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pageCount, type Shot } from "./model";
const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

export function Tip({
  Icon,
  children,
}: {
  Icon: typeof Camera;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left shadow-card">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 -rotate-6 place-items-center rounded-xl bg-postit text-postit-ink"
      >
        <Icon className="size-4" />
      </span>
      <span className="text-ui leading-5 text-muted-foreground">{children}</span>
    </li>
  );
}

export function DayRow({
  kids,
  childId,
  onChildId,
  source,
  onSource,
}: {
  kids: Child[];
  childId: string;
  onChildId: (id: string) => void;
  source: EntrySource;
  onSource: (s: EntrySource) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = kids.find((c) => c.id === childId)?.name;

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="journee-reglages"
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors dur-fast ease-carnet hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Baby className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-ui">
          <span className="font-bold text-foreground">
            {name ?? "Votre enfant"}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{SOURCE_LABELS[source]}</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="text-ui font-bold text-primary">Modifier</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id="journee-reglages"
          className="flex flex-col gap-4 pt-3 pb-1"
        >
          {kids.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="capture-enfant">Enfant</Label>
              <Select
                id="capture-enfant"
                value={childId}
                onChange={(e) => onChildId(e.target.value)}
              >
                {kids.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {kids.length === 0 && (
            <p className="text-meta text-muted-foreground">
              Un profil sera créé au premier envoi ; vous le renommerez ensuite.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label id="capture-lieu">Lieu de la journée</Label>
            <div
              role="group"
              aria-labelledby="capture-lieu"
              className="flex flex-wrap gap-2"
            >
              {SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  size="sm"
                  aria-pressed={source === s}
                  onClick={() => onSource(s)}
                >
                  {source === s && <Check aria-hidden="true" />}
                  {SOURCE_LABELS[s]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function PageGrid({
  shots,
  onRemove,
}: {
  shots: Shot[];
  onRemove: (index: number) => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <h2 className="surtitre text-muted-foreground">Pages du carnet</h2>
        <p className="surtitre text-muted-foreground" data-tabular>
          {pageCount(shots.length)}
        </p>
      </div>
      <ul
        className={cn(
          "mt-5 grid gap-x-4 gap-y-6",
          shots.length === 1
            ? "grid-cols-1"
            : shots.length === 2
              ? "grid-cols-1 min-[560px]:grid-cols-2"
              : "grid-cols-2",
        )}
      >
        {shots.map((s, i) => (
          <li
            key={s.id}
            className={cn(
              "tape polaroid flex flex-col pb-0",
              i % 2 ? "tilt-r tape-blue tape-right" : "tilt-l tape-green",
            )}
          >
            <div className="seam overflow-hidden rounded-[0.25rem] bg-muted">
              <img
                src={s.url}
                alt={`page ${i + 1}`}
                className="aspect-[9/10] w-full object-contain"
              />
            </div>
            <div className="flex h-11 items-center gap-1 pr-0 pl-1">
              <span
                className="font-hand flex-1 text-xl text-muted-foreground"
                data-tabular
              >
                Page {i + 1}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Retirer la page ${i + 1}`}
                onClick={() => onRemove(i)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
