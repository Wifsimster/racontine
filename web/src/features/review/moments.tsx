import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { glanceOf, type DraftItem } from "./draft";
import { itemKind } from "@/lib/items";
import { ITEM_CHIP, ITEM_INK } from "@/lib/ui";

export function GrowingTextarea({
  value,
  minLines,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & { minLines: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const pad =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 24;
    const pitch = parseFloat(style.lineHeight) || 28;
    el.style.height = "0px";
    const lines = Math.max(
      minLines,
      Math.round((el.scrollHeight - pad) / pitch),
    );
    el.style.height = `${lines * pitch + pad}px`;
  }, [minLines]);

  useEffect(() => {
    fit();
  }, [fit, value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
    };
  }, [fit]);

  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      onInput={fit}
      className={cn("min-h-0 resize-none overflow-hidden", className)}
      {...props}
    />
  );
}

export function MomentsGlance({
  items,
  flagged,
}: {
  items: DraftItem[];
  flagged: RegExp[];
}) {
  return (
    <section aria-labelledby="rv-glance" className="flex flex-col gap-2">
      <h2 id="rv-glance" className="surtitre text-muted-foreground">
        La journée
      </h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed px-4 py-3 text-meta text-muted-foreground">
          Aucun repas, aucune sieste n’a été relevé sur cette page. Vous pouvez
          en ajouter juste en dessous — ou publier le récit seul.
        </p>
      ) : (
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const { label, value } = glanceOf(it);
          const Icon = itemKind(it.type).Icon;
          const haystack = `${label} ${value}`;
          const flag = flagged.some((re) => re.test(haystack));
          return (
            <li
              key={i}
              className="grid min-h-14 grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 rounded-2xl border bg-card px-3 py-2.5 shadow-card"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "row-span-2 grid size-10 -rotate-6 place-items-center self-center rounded-xl",
                  ITEM_CHIP[it.type],
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className={cn("min-w-0 truncate text-meta font-extrabold", ITEM_INK[it.type])}>
                {label}
              </span>
              {flag ? (
                <span className="inline-flex items-center gap-1 text-meta font-bold text-warning">
                  <TriangleAlert aria-hidden="true" className="size-3.5" />
                  à vérifier
                </span>
              ) : (
                <span />
              )}
              <span className="col-span-2 min-w-0 text-ui text-foreground line-clamp-2">
                {value || "—"}
              </span>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

