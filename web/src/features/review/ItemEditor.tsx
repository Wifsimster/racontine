import {
  Plus,
  Trash2,
} from "lucide-react";
import {
  type ItemType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DraftItem } from "./draft";
import { ITEM_TYPES_IN_ORDER, itemKind } from "@/lib/items";
import { GrowingTextarea } from "./moments";

/* Les moments de la journée, en CORRECTION : un bloc par type de moment,
   piloté par le registre `lib/items` — un sixième type s'y ajoutera sans
   qu'on rouvre ce fichier. */

export function ItemEditor({
  items,
  onField,
  onRemove,
  onAdd,
}: {
  items: DraftItem[];
  onField: (idx: number, key: string, value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: (type: ItemType) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {ITEM_TYPES_IN_ORDER.map((type) => {
        const rows = items
          .map((it, idx) => ({ it, idx }))
          .filter((x) => x.it.type === type);
        const Icon = itemKind(type).Icon;
        return (
          <section key={type} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              {/* Tuile GRISE, pas le feutre de la catégorie : sur cet écran,
                  la couleur ne dit que la confiance (voir lib/ui.ts). */}
              <h3 className="flex items-center gap-2 text-ui font-bold">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {itemKind(type).label}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAdd(type)}
              >
                <Plus aria-hidden="true" /> Ajouter
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-meta text-muted-foreground">
                Rien de noté ce jour-là.
              </p>
            ) : (
              rows.map(({ it, idx }) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-xl border bg-card px-3 py-3"
                >
                  <div className="grid min-w-0 flex-1 gap-3">
                    {itemKind(it.type).fields.map(({ key, label, long }) => (
                      <label key={key} className="flex flex-col gap-1">
                        <span className="surtitre text-muted-foreground">
                          {label}
                        </span>
                        {long ? (
                          <GrowingTextarea
                            minLines={1}
                            value={it.data[key] ?? ""}
                            onChange={(e) => onField(idx, key, e.target.value)}
                          />
                        ) : (
                          <Input
                            value={it.data[key] ?? ""}
                            onChange={(e) => onField(idx, key, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(idx)}
                    aria-label={`Supprimer ce moment (${itemKind(type).label})`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

