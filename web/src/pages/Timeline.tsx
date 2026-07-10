import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Soup, Moon, Sparkles, HeartPulse, Baby } from "lucide-react";
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

  const body = (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium capitalize">{formatDate(entry.date)}</span>
          <Badge variant="secondary">{SOURCE_LABELS[entry.source]}</Badge>
        </div>
        {entry.status === "draft" && <Badge>À relire</Badge>}
        {entry.status === "processing" && (
          <Badge variant="secondary">Extraction…</Badge>
        )}
        {entry.status === "failed" && (
          <Badge variant="destructive">Échec</Badge>
        )}
      </div>

      {entry.child && (
        <p className="text-xs text-muted-foreground">{entry.child.name}</p>
      )}

      {entry.mood && (
        <p className="text-sm text-muted-foreground">Humeur : {entry.mood}</p>
      )}

      {entry.items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {entry.items.map((it) => (
            <ItemLine key={it.id} item={it} />
          ))}
        </ul>
      )}

      {entry.attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {entry.attachments.map((a) => (
            <img
              key={a.id}
              src={a.thumbUrl}
              alt="page du carnet"
              className="h-20 w-20 shrink-0 rounded-md object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {entry.status === "failed" && entry.failureReason && (
        <p className="text-sm text-destructive">{entry.failureReason}</p>
      )}
    </div>
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
          <p className="text-muted-foreground">
            Aucune journée pour l'instant.
          </p>
          <p className="text-sm text-muted-foreground">
            Photographiez le carnet pour créer votre première entrée.
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
