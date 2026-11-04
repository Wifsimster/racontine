import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookHeart, CloudOff, Printer, Smile, Star } from "lucide-react";
import { api } from "@/lib/api";
import type { BookDay, BookResponse } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";
import { capitalize, fr, fullDate, monthYear } from "@/lib/format";
import { ageLabel } from "@/lib/child";
import { Button } from "@/components/ui/button";
import { PageShell, PageSkeleton, PageState } from "@/components/PageState";
import { ItemLine } from "@/features/journal/glance";

function Day({ day }: { day: BookDay }) {
  return (
    <article className="livre-jour flex flex-col gap-3 border-t pt-5">
      <header>
        <p className="text-meta text-muted-foreground">
          <time dateTime={day.date}>{capitalize(fullDate(day.date))}</time>
          {" · "}
          {SOURCE_LABELS[day.source]}
        </p>
        <h3 className="mt-0.5 font-serif text-title font-semibold text-balance">
          {day.title || "La journée"}
        </h3>
      </header>

      {day.story && (
        <p className="carnet-story measure whitespace-pre-line text-foreground">
          {fr(day.story)}
        </p>
      )}

      {day.highlight && (
        <p className="flex items-start gap-2 font-serif text-body italic">
          <Star aria-hidden="true" className="mt-1.5 size-3.5 shrink-0 text-primary" />
          <span>
            <span className="sr-only">Le temps fort : </span>
            {fr(day.highlight)}
          </span>
        </p>
      )}

      {day.photos.length > 0 && (
        <div className="livre-photos grid grid-cols-2 gap-2 sm:grid-cols-3">
          {day.photos.map((p) => (
            <img
              key={p.id}
              src={p.url}
              alt={`Photo souvenir du ${fullDate(day.date)}`}
              width={p.width ?? undefined}
              height={p.height ?? undefined}
              loading="eager"
              decoding="async"
              className="aspect-[4/3] w-full rounded-md border object-cover"
            />
          ))}
        </div>
      )}

      {(day.items.length > 0 || day.mood) && (
        <ul aria-label="Les moments de la journée" className="flex flex-col gap-1.5">
          {day.mood && (
            <li className="flex items-start gap-3 text-ui">
              <Smile aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-bold">Humeur</span> — {fr(day.mood)}
              </span>
            </li>
          )}
          {day.items.map((it, i) => (
            <ItemLine key={i} item={{ ...it, id: String(i), position: i }} />
          ))}
        </ul>
      )}
    </article>
  );
}

export default function Livre() {
  const [params] = useSearchParams();
  const childId = params.get("childId");
  const annee = Number(params.get("annee")) || null;
  const [book, setBook] = useState<BookResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) {
      setError("Choisissez un enfant depuis les tendances.");
      return;
    }
    let ignore = false;
    setBook(null);
    setError(null);
    api.yearBook(childId, annee).then(
      (b) => !ignore && setBook(b),
      (e) => !ignore && setError(e instanceof Error ? e.message : "Erreur inconnue"),
    );
    return () => {
      ignore = true;
    };
  }, [childId, annee]);

  useEffect(() => {
    if (!book) return;
    const before = document.title;
    document.title = `Le carnet de ${book.child.name} — ${book.year}`;
    return () => {
      document.title = before;
    };
  }, [book]);

  const total = book?.months.reduce((a, m) => a + m.days.length, 0) ?? 0;
  const firstDay = book?.months[0]?.days[0]?.date;
  const lastDay = book?.months.at(-1)?.days.at(-1)?.date;
  const ageFrom =
    book?.child.birthdate && firstDay ? ageLabel(book.child.birthdate, firstDay) : null;
  const ageTo =
    book?.child.birthdate && lastDay ? ageLabel(book.child.birthdate, lastDay) : null;
  const ages =
    ageFrom && ageTo
      ? ageFrom === ageTo
        ? ageFrom
        : `de ${ageFrom} à ${ageTo}`
      : null;

  return (
    <PageShell className="livre lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
      <nav
        aria-label="Le livre"
        className="flex flex-wrap items-center justify-between gap-3 print:hidden"
      >
        <Button asChild variant="ghost" className="-ml-3">
          <Link to={childId ? `/tendances?childId=${childId}` : "/tendances"}>
            <ArrowLeft aria-hidden="true" />
            Tendances
          </Link>
        </Button>
        {book && total > 0 && (
          <Button onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Imprimer ou enregistrer en PDF
          </Button>
        )}
      </nav>

      {book && book.years.length > 1 && (
        <ul aria-label="Les autres années" className="flex flex-wrap gap-x-4 print:hidden">
          {book.years.map((y) => (
            <li key={y}>
              <Link
                to={`/livre?childId=${book.child.id}&annee=${y}`}
                aria-current={y === book.year ? "page" : undefined}
                className="inline-flex min-h-11 items-center text-ui text-muted-foreground underline-offset-4 hover:text-foreground aria-[current=page]:font-bold aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:decoration-primary"
              >
                {y}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <PageState icon={CloudOff} tone="error" title="Le livre n’a pas pu s’ouvrir">
          {error}
        </PageState>
      )}

      {!error && !book && <PageSkeleton label="On relie les pages" rows={2} />}

      {book && total === 0 && (
        <PageState icon={BookHeart} title={`Pas encore de journée en ${book.year}`}>
          Le livre de {book.child.name} se remplira avec les journées publiées.
        </PageState>
      )}

      {book && total > 0 && (
        <>
          <header className="livre-couverture flex flex-col items-center gap-3 border-y py-16 text-center">
            <p className="surtitre text-primary">Le carnet de</p>
            <h1 className="livre-prenom font-serif text-[2.75rem] leading-[3.25rem] font-semibold">
              {book.child.name}
            </h1>
            <p className="livre-annee font-serif text-display font-semibold text-muted-foreground" data-tabular>
              {book.year}
            </p>
            <p className="text-meta text-muted-foreground" data-tabular>
              {total} journée{total > 1 ? "s" : ""}
              {ages ? ` · ${ages}` : ""}
            </p>
          </header>

          {book.months.map((m) => (
            <section
              key={m.month}
              aria-labelledby={`livre-${m.month}`}
              className="livre-mois flex flex-col gap-6"
            >
              <h2
                id={`livre-${m.month}`}
                className="font-serif text-display font-semibold"
              >
                {capitalize(monthYear(`${m.month}-01`))}
              </h2>
              {m.days.map((d) => (
                <Day key={d.id} day={d} />
              ))}
            </section>
          ))}
        </>
      )}
    </PageShell>
  );
}
