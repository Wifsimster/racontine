import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Soup,
  Moon,
  Sparkles,
  HeartPulse,
  Baby,
  Star,
  ChevronDown,
  Pencil,
  BookHeart,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type Entry,
  type EntryItem,
  type MealData,
  type NapData,
  type ActivityData,
  type AnecdoteData,
  type HealthData,
  SOURCE_LABELS,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function ItemLine({ item }: { item: EntryItem }) {
  if (item.type === "meal") {
    const d = item.data as MealData;
    return (
      <li className="flex items-start gap-2 text-sm">
        <Soup className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">{d.moment}</span> — {d.contenu}
          {d.appetit ? ` (${d.appetit})` : ""}
        </span>
      </li>
    );
  }
  if (item.type === "nap") {
    const d = item.data as NapData;
    return (
      <li className="flex items-start gap-2 text-sm">
        <Moon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          Sieste {d.debut ?? "?"}
          {d.fin ? ` → ${d.fin}` : ""}
          {d.note ? ` · ${d.note}` : ""}
        </span>
      </li>
    );
  }
  if (item.type === "activity") {
    const d = item.data as ActivityData;
    return (
      <li className="flex items-start gap-2 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{d.label}</span>
      </li>
    );
  }
  if (item.type === "health") {
    const d = item.data as HealthData;
    return (
      <li className="flex items-start gap-2 text-sm">
        <HeartPulse className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{d.note}</span>
      </li>
    );
  }
  const d = item.data as AnecdoteData;
  return (
    <li className="flex items-start gap-2 text-sm italic">
      <Baby className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>« {d.text} »</span>
    </li>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  const needsReview =
    entry.status === "draft" ||
    entry.status === "processing" ||
    entry.status === "failed";

  const hasStory = Boolean(entry.story || entry.title);

  const body = (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      {/* En-tête : date + contexte */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium capitalize text-muted-foreground">
            {formatDate(entry.date)}
          </span>
          {entry.title ? (
            <h2 className="font-serif text-xl leading-tight tracking-tight">
              {entry.title}
            </h2>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary">{SOURCE_LABELS[entry.source]}</Badge>
          {entry.status === "draft" && <Badge>À relire</Badge>}
          {entry.status === "processing" && (
            <Badge variant="secondary">Extraction…</Badge>
          )}
          {entry.status === "failed" && <Badge variant="destructive">Échec</Badge>}
        </div>
      </div>

      {entry.child && (
        <p className="-mt-2 text-xs text-muted-foreground">{entry.child.name}</p>
      )}

      {/* Le récit — cœur de la valorisation */}
      {entry.story && (
        <p className="text-[15px] leading-relaxed text-foreground/90">
          {entry.story}
        </p>
      )}

      {/* Temps fort du jour */}
      {entry.highlight && (
        <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-sm">
          <Star className="mt-0.5 size-4 shrink-0 fill-primary/20 text-primary" />
          <span className="font-medium text-foreground/90">{entry.highlight}</span>
        </div>
      )}

      {entry.mood && (
        <p className="text-sm text-muted-foreground">Humeur : {entry.mood}</p>
      )}

      {/* Photos du carnet */}
      {entry.attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {entry.attachments.map((a) => (
            <img
              key={a.id}
              src={a.thumbUrl}
              alt="page du carnet"
              className="h-20 w-20 shrink-0 rounded-lg object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* Détails structurés — repliés quand un récit existe déjà */}
      {entry.items.length > 0 &&
        (hasStory ? (
          <details className="group">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              Le détail de la journée
            </summary>
            <ul className="mt-3 flex flex-col gap-1.5 border-l pl-3">
              {entry.items.map((it) => (
                <ItemLine key={it.id} item={it} />
              ))}
            </ul>
          </details>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entry.items.map((it) => (
              <ItemLine key={it.id} item={it} />
            ))}
          </ul>
        ))}

      {entry.status === "failed" && entry.failureReason && (
        <p className="text-sm text-destructive">{entry.failureReason}</p>
      )}

      {needsReview && (
        <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <Pencil className="size-3.5" />
          {entry.status === "failed" ? "Reprendre" : "Relire et publier"}
        </span>
      )}
    </article>
  );

  return needsReview ? (
    <Link to={`/entries/${entry.id}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function Timeline() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);

  async function load(offset: number) {
    const res = await api.timeline({ offset, limit: 20 });
    setEntries((prev) => (offset === 0 ? res.entries : [...prev, ...res.entries]));
    setNextOffset(res.nextOffset);
    setLoading(false);
  }

  useEffect(() => {
    load(0).catch(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4 pb-28">
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Chargement…</p>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <BookHeart className="size-7 text-primary" />
          </div>
          <p className="font-medium">Le journal est encore vide</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Photographiez le carnet et Racontine transforme la journée en un joli
            souvenir, prêt à partager.
          </p>
        </div>
      ) : (
        entries.map((e) => <EntryCard key={e.id} entry={e} />)
      )}

      {nextOffset !== null && !loading && (
        <Button variant="outline" onClick={() => load(nextOffset)}>
          Charger plus
        </Button>
      )}

      <Link
        to="/capture"
        className="fixed inset-x-0 bottom-6 mx-auto w-full max-w-lg px-4"
      >
        <Button size="lg" className="w-full shadow-lg">
          <Camera />
          Photographier le carnet
        </Button>
      </Link>
    </div>
  );
}
