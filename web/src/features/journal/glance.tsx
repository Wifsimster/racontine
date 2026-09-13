import {
  Smile,
  Soup,
} from "lucide-react";
import {
  type Entry,
  type EntryItem,
  type ItemType,
} from "@/lib/types";
import { ITEM_CHIP } from "@/lib/ui";
import {
  ITEM_KINDS,
  itemKind,
  type ItemGlance,
} from "@/lib/items";
import {
  fr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/* La bande de feutres et le détail replié d'une journée : ce qu'une carte
   montre d'un coup d'œil, et ce qu'elle montre quand on l'ouvre. */

export function moodShort(mood: string): string | null {
  const first = mood.split(/[,;]| et | puis /i)[0].trim();
  if (first.length <= 16) return first;
  const cut = first.slice(0, 16);
  const space = cut.lastIndexOf(" ");
  return space >= 4 ? cut.slice(0, space) + "…" : null;
}

/* --------------------------------------------------------------------------
   La bande de feutres : le résumé de la journée, chiffré.
   TROIS pastilles au plus, donc une seule ligne : au-delà, la bande passe à
   deux rangs et se met à crier plus fort que le titre. L’ordre est celui des
   questions qu’un parent se pose en ouvrant l’app — a-t-il mangé, a-t-il
   dormi, comment était-il — puis ce qu’il a fait.

   DEUX RÈGLES, et la seconde a été ajoutée après mesure :

   · CHAQUE PASTILLE DIT CE QU’ELLE COMPTE, en mots. « 2 repas » et « joyeuse »
     se nomment tout seuls ; « 2 h 05 » ne se nommait pas — une durée nue sous
     une lune pouvait aussi bien être UNE sieste que le TOTAL de la journée. Le
     mot est donc écrit, et son NOMBRE porte l’information : « sieste 2 h 05 »
     = une sieste, « siestes 2 h 05 » = le cumul de plusieurs. Mesuré à 390 px :
     83 + 116 + 83 + 2 × 6 de gouttière = 294 px dans 308 px de feuille, la
     bande tient sur un rang.
   · CE QUI DÉBORDE DES TROIS N’EST PLUS MUET. Les feutres des types laissés de
     côté (activité, anecdote, santé) sont repris en petit sur la ligne de
     dépli, à côté du compteur : « 9 moments » disait un reste sans dire lequel.
   -------------------------------------------------------------------------- */

export type Glance = {
  key: string;
  /** `null` = l’humeur : ce n’est pas un type de moment, donc pas de feutre. */
  type: ItemType | null;
  Icon: typeof Soup;
  /** Ce qu’on lit : un chiffre, une durée, un mot. */
  value: string;
  /**
   * Le nom du feutre, porté par l’ICÔNE (`role="img" aria-label`) et non par un
   * texte caché. Deux raisons de ne pas utiliser `sr-only` ici : l’utilitaire de
   * Tailwind pose `margin: -1px` (valeur hors grille, échec dur de I3) et un
   * `overflow: hidden` sur un texte plus large que sa boîte, que tout audit
   * compte — à raison — comme un nœud de texte rogné (I5). L’app entière évite
   * déjà `sr-only` pour des raisons voisines (voir App.tsx).
   */
  spoken: string;
};

export function glanceOf(entry: Entry): Glance[] {
  const out: Glance[] = [];
  for (const kind of ITEM_KINDS) {
    // L'humeur s'intercale après la sieste : ce sont les trois questions du
    // soir — a-t-il mangé, a-t-il dormi, comment était-il.
    if (kind.type === "activity") {
      const mood = entry.mood ? moodShort(fr(entry.mood)) : null;
      if (mood)
        out.push({
          key: "mood",
          type: null,
          Icon: Smile,
          value: mood,
          spoken: "humeur",
        });
    }
    const mine = entry.items.filter((i) => i.type === kind.type);
    const glance: ItemGlance | null = kind.glance(mine);
    if (glance)
      out.push({ key: kind.type, type: kind.type, Icon: kind.Icon, ...glance });
  }
  return out;
}

/**
 * QUELS trois feutres, quand il y en a plus de trois.
 *
 * Avant, c’étaient les trois PREMIERS, et l’ordre était celui de la lecture :
 * une journée avec repas + sieste + humeur poussait donc silencieusement la
 * SANTÉ hors de la carte — le bobo au genou, la fièvre, le médicament donné à
 * 11 h. C’est exactement l’information qu’un parent ouvre l’app pour trouver.
 *
 * On sépare donc deux choses qui n’ont aucune raison de coïncider :
 *   · le CHOIX se fait par importance (santé d’abord, puis les deux questions
 *     du soir — a-t-il mangé, a-t-il dormi —, puis l’humeur, puis ce qu’il a
 *     fait) ;
 *   · l’AFFICHAGE garde l’ordre de lecture, pour que la bande d’une carte à
 *     l’autre ne se réorganise pas sous l’œil.
 * Le reste n’est pas perdu : le compteur du dépli le chiffre, et la liste
 * dépliée le nomme en clair.
 */
export const GLANCE_RANK: Record<string, number> = {
  // Le rang de chaque type vient du registre des moments ; seule l'humeur, qui
  // n'est pas un moment, est classée ici.
  ...Object.fromEntries(ITEM_KINDS.map((k) => [k.type, k.glanceRank])),
  mood: 3,
};

export function pickGlance(all: Glance[]): Glance[] {
  if (all.length <= 3) return all;
  const keep = new Set(
    [...all]
      .sort((a, b) => (GLANCE_RANK[a.key] ?? 9) - (GLANCE_RANK[b.key] ?? 9))
      .slice(0, 3)
      .map((g) => g.key),
  );
  return all.filter((g) => keep.has(g.key));
}

export function GlanceStrip({ stats }: { stats: Glance[] }) {
  if (stats.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {stats.map(({ key, type, Icon, value, spoken }) => (
        <li
          key={key}
          className={cn(
            // 28 px = un interligne du cahier. `gap-1.5` (6 px) est le
            // demi-pas optique icône <-> libellé, pas un pas de mise en page ;
            // la gouttière entre pastilles est au même cran pour que les trois
            // feutres tiennent sur un rang une fois nommés (294/308 px).
            "flex h-7 items-center gap-1.5 rounded-md px-2",
            type
              ? ITEM_CHIP[type]
              : // L’humeur n’est pas un moment : elle reste à l’encre. Cette
                // absence de feutre est une information, pas un oubli.
                "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4" role="img" aria-label={spoken} />
          <span className="text-meta font-bold" data-tabular>
            {value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------------
   Le détail replié : les moments, un par ligne, avec leur feutre.
   -------------------------------------------------------------------------- */

export function Chip({ type, icon }: { type: ItemType; icon?: typeof Soup }) {
  const Icon = icon ?? itemKind(type).Icon;
  return (
    <span
      className={cn(
        // Tuile de 28 px remontée de 4 px : elle se centre optiquement sur la
        // première ligne de texte (20 px) au lieu de pendre sous elle.
        "-mt-1 grid size-7 shrink-0 place-items-center rounded-md",
        ITEM_CHIP[type],
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Une ligne de détail : la puce colorée du type, puis ce que ce type a à dire.
 * La cascade de `if (item.type === …)` qui tenait ici est devenue le
 * `renderLine` de chaque type dans `lib/items.tsx` — un sixième type de moment
 * s'affichera sans qu'on rouvre ce fichier.
 */
export function ItemLine({ item }: { item: EntryItem }) {
  const kind = itemKind(item.type);
  return (
    <li className="flex items-start gap-3 text-ui">
      <Chip type={item.type} icon={kind.iconFor(item)} />
      {kind.renderLine(item)}
    </li>
  );
}
