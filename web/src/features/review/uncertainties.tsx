import { useState } from "react";
import {
  Check,
  ChevronDown,
  PenLine,
  TriangleAlert,
} from "lucide-react";
import {
  type Uncertainty,
  type UncertaintyField,
} from "@/lib/types";
import { highlightToken, unquoted } from "@/lib/reading-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FIELD_ORIGIN: Record<UncertaintyField, string> = {
  titre: "dans le titre",
  recit: "dans le récit",
  temps_fort: "dans le temps fort",
  transcription_integrale: "dans la transcription",
};

export function ResolvedReading({
  id,
  item,
  onEdit,
}: {
  id: string;
  item: Uncertainty;
  onEdit: () => void;
}) {
  const kept = unquoted(item.resolved ?? "") === unquoted(item.original);
  return (
    <button
      id={id}
      type="button"
      onClick={onEdit}
      aria-label={`Revenir sur la lecture « ${unquoted(item.original)} »${
        item.champ ? ` (${FIELD_ORIGIN[item.champ]})` : ""
      }`}
      className="tap flex min-h-11 w-full items-center gap-2 rounded-xl bg-success-bg px-3 text-left text-success transition-colors dur-fast ease-carnet hover:bg-card"
    >
      <Check aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-meta">
        {kept ? (
          <>
            <span className="font-serif">« {unquoted(item.original)} »</span>{" "}
            gardé tel quel
          </>
        ) : (
          <>
            <span className="font-serif line-through">
              « {unquoted(item.original)} »
            </span>{" "}
            <span aria-hidden="true">→</span>{" "}
            <span className="font-bold">{item.resolved}</span>
          </>
        )}
      </span>
      <PenLine aria-hidden="true" className="size-4 shrink-0" />
    </button>
  );
}

export function CollapsedReading({
  id,
  item,
  phrase,
  onOpen,
}: {
  id: string;
  item: Uncertainty;
  phrase: string | null;
  onOpen: () => void;
}) {
  const word = unquoted(item.original);
  return (
    <button
      id={id}
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Trancher la lecture « ${word} »${
        phrase ? `, dans « ${phrase} »` : ""
      }`}
      className="tap flex min-h-14 w-full items-center gap-3 rounded-xl border border-warning bg-warning-bg px-3 py-2 text-left transition-colors dur-fast ease-carnet hover:bg-card"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <span className="surtitre block truncate text-warning">
          À vérifier{item.champ ? ` · ${FIELD_ORIGIN[item.champ]}` : ""}
        </span>
        <span className="block truncate font-serif text-ui text-foreground">
          « {word} »
        </span>
        {phrase && (
          <span className="block truncate font-serif text-xs text-muted-foreground">
            {highlightToken(phrase, word)}
          </span>
        )}
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-warning" />
    </button>
  );
}

export function UncertaintyCard({
  id,
  item,
  phrase,
  disabled,
  resolving,
  onResolve,
}: {
  id: string;
  item: Uncertainty;
  phrase: string | null;
  disabled: boolean;
  resolving: boolean;
  onResolve: (value: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const [choice, setChoice] = useState<string | null>(null);

  const word = unquoted(item.original);

  const suggestions = item.suggestions
    .map((sug) => unquoted(sug))
    .filter(
      (sug, i, self) =>
        sug &&
        sug.toLowerCase() !== word.toLowerCase() &&
        self.findIndex((o) => o.toLowerCase() === sug.toLowerCase()) === i,
    );

  const [customOpen, setCustomOpen] = useState(suggestions.length === 0);
  const [customAsked, setCustomAsked] = useState(false);

  function pick(value: string) {
    setChoice(value);
    onResolve(value);
  }

  return (
    <div
      id={id}
      tabIndex={-1}
      role="group"
      aria-label={`Lecture à vérifier : ${word}${phrase ? `, dans « ${phrase} »` : ""}`}
      className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-bg p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
    >
      <p className="surtitre flex items-center gap-2 text-warning">
        <TriangleAlert aria-hidden="true" className="size-4" />
        À vérifier
        {item.champ ? ` · ${FIELD_ORIGIN[item.champ]}` : ""}
      </p>

      <p className="font-serif text-body text-foreground">
        «{" "}
        <span className="underline decoration-warning decoration-wavy underline-offset-4">
          {word}
        </span>{" "}
        »
      </p>
      {phrase && (
        <p className="border-l-2 border-warning pl-3 font-serif text-meta text-muted-foreground">
          {highlightToken(phrase, word)}
        </p>
      )}
      {item.contexte && (
        <p className="text-meta text-muted-foreground">
          {highlightToken(item.contexte, word)}
        </p>
      )}
      {suggestions.length === 0 && (
        <p className="text-meta text-muted-foreground">
          Aucune autre lecture proposée : gardez ce mot, ou écrivez ce qui est
          sur le papier.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto max-w-full min-h-11 rounded-full border-warning py-2 text-left whitespace-normal text-warning hover:bg-card"
            loading={resolving && choice === s}
            disabled={disabled}
            onClick={() => pick(s)}
          >
            {s}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto max-w-full min-h-11 rounded-full py-2 text-left whitespace-normal text-warning hover:bg-card"
          loading={resolving && choice === word}
          disabled={disabled}
          onClick={() => pick(word)}
        >
          Garder « {word} »
        </Button>
        {!customOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto max-w-full min-h-11 rounded-full py-2 text-left whitespace-normal text-warning hover:bg-card"
            disabled={disabled}
            onClick={() => {
              setCustomOpen(true);
              setCustomAsked(true);
            }}
            aria-label={`Saisir une autre lecture pour « ${word} »`}
          >
            <PenLine aria-hidden="true" />
            Autre…
          </Button>
        )}
      </div>

      {customOpen && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus={customAsked}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                e.preventDefault();
                pick(custom.trim());
              }
              if (e.key === "Escape" && !custom) setCustomOpen(false);
            }}
            placeholder="Ce qui est écrit sur le papier…"
            aria-label={`Autre lecture pour « ${word} »`}
            disabled={disabled}
          />
          {custom.trim() && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="border-warning text-warning"
              loading={resolving && choice === custom.trim()}
              disabled={disabled}
              onClick={() => pick(custom.trim())}
              aria-label="Valider cette lecture"
            >
              {resolving && choice === custom.trim() ? null : (
                <Check aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
