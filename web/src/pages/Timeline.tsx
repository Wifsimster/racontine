import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  BookOpenText,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Cookie,
  HeartPulse,
  Images,
  ScanLine,
  Moon,
  PenLine,
  RotateCcw,
  Send,
  Smile,
  Soup,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  TriangleAlert,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api } from "@/lib/api";
import { canWrite, roleMap } from "@/lib/access";
import {
  type ActivityData,
  type AnecdoteData,
  type AttachmentRef,
  type Entry,
  type EntryItem,
  type HealthData,
  type ItemType,
  type MealData,
  type MemberRole,
  type NapData,
  SOURCE_LABELS,
} from "@/lib/types";
import { ITEM_CHIP } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ===========================================================================
   LE JOURNAL — l’écran qu’on ouvre chaque soir.

   Il doit se lire à DEUX VITESSES, et la carte est dessinée pour ça :

     1. en deux secondes, sans lire  : le prénom, le jour, le titre, puis la
        BANDE DE FEUTRES — trois pastilles chiffrées (a-t-il mangé, a-t-il
        dormi, comment était-il) dans les couleurs du carnet. C’est de
        l’information, pas de la décoration : la même teinte veut dire la même
        chose ici, dans le détail replié et sur l’écran de relecture.
     2. quand on ralentit : le récit, posé sur les lignes du cahier, le temps
        fort, les pages photographiées, puis le détail des moments.

   Trois décisions de fond, prises contre les versions précédentes :

   · LE RÉCIT NE PREND PLUS TOUTE LA CARTE. Dans le fil, il est coupé à TROIS
     lignes du cahier (3 × 28 = 84 px, un compte entier d’interlignes) : la
     carte passe de 803 à 609 px, le premier écran porte enfin une journée
     complète — jour, titre, feutres, récit, temps fort, sortie, pages — et
     montre 34 px de la journée suivante. La coupe se déplie sur place.

   · LA RÉGLURE NE PORTE QUE LE RÉCIT. Avant, tout le carton était réglé : les
     lignes du cahier (pas de 28 px) traversaient le titre en 22/20 et
     passaient derrière les photos et les encarts, ce qui donnait un fond de
     papier accidenté. Désormais le trait de marge groseille court sur toute la
     feuille (c’est lui qui dit « carnet »), mais les lignes ne sont dessinées
     que derrière le texte transcrit — celui qui est en 17/28, donc exactement
     sur les lignes. La réglure devient un signe : ici, c’est la page recopiée.
   · LA CARTE N’EST PLUS UN LIEN GÉANT. Une journée à relire portait un `<a>`
     autour de tout, y compris autour du `<summary>` et des photos (interactif
     dans de l’interactif). L’action est maintenant une ligne de pied de carte
     de 44 px, ce qui rend aussi le clavier lisible.

   Les trois états sont dessinés (I7) : squelette à la FORME de la réponse,
   vide qui montre ce que l’app fabrique, erreur qui nomme la cause, le remède
   et deux sorties — plus jamais « Le journal est encore vide » quand c’est le
   serveur qui est tombé.
   =========================================================================== */

const ITEM_ICON: Record<ItemType, typeof Soup> = {
  meal: Soup,
  nap: Moon,
  activity: Sparkles,
  anecdote: Baby,
  health: HeartPulse,
};

/** Espace insécable : « 2 h 05 », « 12 h 45 » — typographie française. */
const NBSP = "\u00a0";

/**
 * Le texte TRANSCRIT passe par la même typographie que la copie de l’app.
 *
 * Le journal est un objet composé : sur une même page, « aujourd’hui » écrit par
 * l’app et « c'est mieux dépareillées » sorti du modèle ne peuvent pas porter
 * deux apostrophes différentes — l’une courbe, l’autre une quille de machine à
 * écrire. La transformation est volontairement minuscule et sans perte : une
 * apostroph droite ENTRE DEUX LETTRES devient l’apostrophe française. Rien
 * d’autre n’est touché (ni les guillemets, ni les points de suspension, ni les
 * chiffres) et la donnée stockée, elle, n’est jamais modifiée.
 */
function fr(text: string): string {
  return text.replace(/(\p{L})['\u2018](\p{L})/gu, "$1\u2019$2");
}

const fmtDayMonth = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});
const fmtWeekdayDayMonth = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const fmtFull = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtMonthYear = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

function dayOf(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** Nombre de jours calendaires entre aujourd’hui et une date ISO. */
function daysAgo(iso: string): number {
  const d = dayOf(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

/**
 * Le repère de date affiché sur la carte. « Aujourd’hui » / « Hier » d’abord :
 * c’est ainsi qu’un parent parle de la journée qu’il vient de vivre. Au-delà,
 * le jour de la semaine revient, parce qu’il situe mieux que le seul chiffre.
 */
function dayLabel(iso: string): string {
  const n = daysAgo(iso);
  if (n === 0) return "aujourd’hui";
  if (n === 1) return "hier";
  if (n < 7) return fmtWeekdayDayMonth.format(dayOf(iso));
  return fmtDayMonth.format(dayOf(iso));
}

/** Icône de repas selon le moment de la journée (à défaut, un bol). */
function mealIcon(moment?: string): typeof Soup {
  const m = (moment ?? "").toLowerCase();
  if (m.includes("matin") || m.includes("réveil") || m.includes("petit-déj"))
    return Sunrise;
  if (m.includes("midi") || m.includes("déjeun") || m.includes("dîner"))
    return Sun;
  if (m.includes("goûter") || m.includes("gouter") || m.includes("collation"))
    return Cookie;
  return Soup;
}

/** « 12h45 », « 12:45 », « 12 h » → minutes depuis minuit. */
function parseTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatClock(s?: string | null): string | null {
  const t = parseTime(s);
  if (t === null) return null;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

/**
 * L’humeur en un mot pour la bande de feutres — « joyeuse et très bavarde »
 * devient « joyeuse », la phrase entière restant dans le détail et pour les
 * lecteurs d’écran. Trois règles :
 *   · la coupe est explicite (« … » écrit dans le texte) et jamais faite en
 *     CSS : un `truncate` produit un nœud de texte rogné, que l’audit compte
 *     comme un défaut — et à juste titre, on ne peut plus le lire ;
 *   · on ne coupe JAMAIS au milieu d’un mot (« extraordinaireme… ») ;
 *   · si le premier mot ne tient pas à lui seul, la pastille disparaît : une
 *     humeur de quarante caractères ne se lit pas en deux secondes, sa place
 *     est dans le détail.
 */
function moodShort(mood: string): string | null {
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

type Glance = {
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

function glanceOf(entry: Entry): Glance[] {
  const byType = (t: ItemType) => entry.items.filter((i) => i.type === t);
  const out: Glance[] = [];

  const meals = byType("meal");
  if (meals.length > 0) {
    out.push({
      key: "meal",
      type: "meal",
      Icon: Soup,
      value: `${meals.length} repas`,
      spoken: "repas",
    });
  }

  const naps = byType("nap");
  if (naps.length > 0) {
    let total = 0;
    for (const n of naps) {
      const d = n.data as NapData;
      const a = parseTime(d.debut);
      const b = parseTime(d.fin);
      if (a !== null && b !== null && b > a) total += b - a;
    }
    // Le mot AVANT la durée, et son nombre dit si c’est un cumul : « sieste
    // 2 h 05 » (une seule) contre « siestes 2 h 05 » (le total du jour).
    const noun = naps.length > 1 ? "siestes" : "sieste";
    out.push({
      key: "nap",
      type: "nap",
      Icon: Moon,
      value: total > 0 ? `${noun} ${formatDuration(total)}` : `${naps.length} ${noun}`,
      spoken: "sieste",
    });
  }

  const mood = entry.mood ? moodShort(fr(entry.mood)) : null;
  if (mood) {
    out.push({
      key: "mood",
      type: null,
      Icon: Smile,
      value: mood,
      spoken: "humeur",
    });
  }

  const acts = byType("activity");
  if (acts.length > 0) {
    out.push({
      key: "activity",
      type: "activity",
      Icon: Sparkles,
      value: `${acts.length} activité${acts.length > 1 ? "s" : ""}`,
      spoken: "activités",
    });
  }

  const anec = byType("anecdote");
  if (anec.length > 0) {
    out.push({
      key: "anecdote",
      type: "anecdote",
      Icon: Baby,
      value: `${anec.length} anecdote${anec.length > 1 ? "s" : ""}`,
      spoken: "anecdotes",
    });
  }

  const health = byType("health");
  if (health.length > 0) {
    out.push({
      key: "health",
      type: "health",
      Icon: HeartPulse,
      value: health.length > 1 ? `${health.length} soins` : "santé",
      spoken: "santé",
    });
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
const GLANCE_RANK: Record<string, number> = {
  health: 0,
  meal: 1,
  nap: 2,
  mood: 3,
  activity: 4,
  anecdote: 5,
};

function pickGlance(all: Glance[]): Glance[] {
  if (all.length <= 3) return all;
  const keep = new Set(
    [...all]
      .sort((a, b) => (GLANCE_RANK[a.key] ?? 9) - (GLANCE_RANK[b.key] ?? 9))
      .slice(0, 3)
      .map((g) => g.key),
  );
  return all.filter((g) => keep.has(g.key));
}

function GlanceStrip({ stats }: { stats: Glance[] }) {
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

function Chip({ type, icon }: { type: ItemType; icon?: typeof Soup }) {
  const Icon = icon ?? ITEM_ICON[type];
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

function ItemLine({ item }: { item: EntryItem }) {
  if (item.type === "meal") {
    const d = item.data as MealData;
    return (
      <li className="flex items-start gap-3 text-ui">
        <Chip type="meal" icon={mealIcon(d.moment)} />
        <span>
          <span className="font-bold">{fr(d.moment)}</span> — {fr(d.contenu)}
          {d.appetit ? ` (${fr(d.appetit)})` : ""}
        </span>
      </li>
    );
  }
  if (item.type === "nap") {
    const d = item.data as NapData;
    const a = formatClock(d.debut);
    const b = formatClock(d.fin);
    const from = parseTime(d.debut);
    const to = parseTime(d.fin);
    const dur = from !== null && to !== null && to > from ? to - from : null;
    return (
      <li className="flex items-start gap-3 text-ui">
        <Chip type="nap" />
        <span>
          <span className="font-bold">Sieste</span>{" "}
          <span data-tabular>
            {a ?? "?"}
            {b ? ` → ${b}` : ""}
          </span>
          {dur ? ` (${formatDuration(dur)})` : ""}
          {d.note ? ` · ${fr(d.note)}` : ""}
        </span>
      </li>
    );
  }
  if (item.type === "activity") {
    const d = item.data as ActivityData;
    return (
      <li className="flex items-start gap-3 text-ui">
        <Chip type="activity" />
        <span>{fr(d.label)}</span>
      </li>
    );
  }
  if (item.type === "health") {
    const d = item.data as HealthData;
    return (
      <li className="flex items-start gap-3 text-ui">
        <Chip type="health" />
        <span>{fr(d.note)}</span>
      </li>
    );
  }
  const d = item.data as AnecdoteData;
  return (
    <li className="flex items-start gap-3 text-ui">
      <Chip type="anecdote" />
      {/* Les guillemets ET l’encre prune : le mot d’enfant reste reconnaissable
          même en noir et blanc. Pas d’italique — aucune fonte italique n’est
          embarquée, l’oblique serait synthétique. */}
      <span className="text-anecdote">
        «{NBSP}{fr(d.text)}{NBSP}»
      </span>
    </li>
  );
}

/* --------------------------------------------------------------------------
   Les pages du carnet : la photo est un souvenir, pas une pièce jointe.
   Ratio déclaré, rayon accordé à la carte, liseré de 1 px pour qu’une page
   crème garde son bord sur du papier crème — et jamais d’ombre portée sur une
   image (l’ombre appartient à la carte).
   -------------------------------------------------------------------------- */

function PageStrip({
  pages,
  dateText,
  onOpen,
}: {
  pages: AttachmentRef[];
  dateText: string;
  onOpen: (index: number, from: HTMLElement) => void;
}) {
  const shown = pages.slice(0, pages.length > 3 ? 2 : 3);
  const rest = pages.length - shown.length;
  const single = pages.length === 1;

  return (
    <ul
      className={cn(
        "grid gap-2",
        single
          ? "grid-cols-1"
          : pages.length === 2
            ? "grid-cols-2"
            : "grid-cols-3",
      )}
    >
      {shown.map((a, i) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={(e) => onOpen(i, e.currentTarget)}
            className={cn(
              // Ratios DÉCLARÉS : 3/2 pour une page seule (une bande, comme un
              // scan), carré dès qu’il y en a plusieurs — une page de carnet
              // est presque carrée, un cadre 4/3 lui coupait l’en-tête.
              "seam block w-full overflow-hidden rounded-xl transition-transform dur-press ease-carnet active:scale-[0.98]",
              single ? "aspect-[3/2]" : "aspect-square",
            )}
          >
            <img
              src={a.thumbUrl}
              alt={`Page ${i + 1} du carnet du ${dateText}`}
              className="size-full object-cover"
              loading="lazy"
            />
          </button>
        </li>
      ))}
      {rest > 0 && (
        <li>
          {/* Le « +N » est une tuile PLEINE, pas un voile posé sur une photo :
              du blanc sur une image inconnue n’est jamais un contraste mesuré. */}
          <button
            type="button"
            onClick={(e) => onOpen(shown.length, e.currentTarget)}
            aria-label={`Voir les ${pages.length} pages du carnet`}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl bg-muted text-foreground transition-colors dur-fast hover:bg-accent"
          >
            <Images className="size-5" aria-hidden="true" />
            <span className="text-meta font-bold" data-tabular>
              +{rest}
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}

/**
 * Le lecteur de pages : plein écran, sur le papier (pas un voile translucide —
 * un texte blanc sur une photo pâle voilée n’atteint pas 4,5:1 et on ne peut
 * pas le mesurer). Échap ferme, les flèches feuillettent, le focus revient sur
 * la vignette d’où l’on vient.
 *
 * Il est monté en PORTAIL sur `<body>`, et ce n’est pas un détail : la page est
 * rendue dans un `<main>` qui porte une animation d’opacité (`page-enter`), donc
 * un contexte d’empilement. Un `z-60` posé à l’intérieur de `main` reste sous
 * l’en-tête `z-50` de la coquille, qui en est le frère — le lecteur s’ouvrait
 * DERRIÈRE la barre du haut, sa propre barre (« Page 1 / 2 », le bouton
 * Fermer) invisible dessous.
 */
function PageViewer({
  pages,
  index,
  date,
  onIndex,
  onClose,
}: {
  pages: AttachmentRef[];
  index: number;
  /** La date ISO de la journée : le titre long pour l’annonce, court à l’écran. */
  date: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const count = pages.length;
  const dateText = fmtFull.format(dayOf(date));
  const shortDate = fmtDayMonth.format(dayOf(date));

  /* ── L’agrandissement, la fonction qui manquait ───────────────────────────
     C’est la seule image du produit qu’il FAUT pouvoir agrandir : une page
     manuscrite servie sur 358 px de large, dont on veut relire un mot que la
     transcription a peut-être manqué. À l’échelle « ajustée » la page tient
     dans l’écran (la largeur est limitante, 313 px de hauteur restent vides) ;
     agrandie, elle prend TOUTE la hauteur — ×1,7, soit 609 px de large sur un
     viewport de 390 — et l’on défile sur un seul axe : rien n’est coupé en haut
     ni en bas, ce qui compte quand on cherche une ligne précise. Le geste est disponible deux fois — la page elle-même est un
     bouton, et la barre porte le même contrôle nommé — parce qu’au doigt on
     touche l’image et au clavier on tabule jusqu’au bouton. */
  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [index]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // On agrandit depuis le CENTRE de la page, pas depuis son coin gauche.
    box.scrollLeft = zoom ? (box.scrollWidth - box.clientWidth) / 2 : 0;
    box.scrollTop = 0;
  }, [zoom, index]);

  useEffect(() => {
    closeRef.current?.focus();
    // Le carnet dessous ne défile pas pendant qu’on lit une page.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // `aria-modal` promet que le reste de la page est hors d’atteinte : on
      // tient la promesse au clavier aussi, en bouclant la tabulation dans le
      // lecteur au lieu de laisser le focus filer derrière le voile.
      if (e.key === "Tab" && rootRef.current) {
        const f = Array.from(
          rootRef.current.querySelectorAll<HTMLElement>("button"),
        );
        if (f.length > 0) {
          const first = f[0];
          const last = f[f.length - 1];
          const here = document.activeElement;
          if (
            e.shiftKey &&
            (here === first || !rootRef.current.contains(here))
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && here === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      if (count < 2) return;
      if (e.key === "ArrowRight") onIndex((index + 1) % count);
      if (e.key === "ArrowLeft") onIndex((index - 1 + count) % count);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, count, onIndex, onClose]);

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Pages du carnet du ${dateText}`}
      className="page-enter fixed inset-0 z-60 flex flex-col bg-background px-safe"
    >
      <div className="flex h-header shrink-0 items-center justify-between gap-2 border-b px-2 pt-safe">
        <p className="surtitre px-2 text-muted-foreground" data-tabular>
          {shortDate} · page {index + 1} / {count}
        </p>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              zoom ? "Ajuster la page à l’écran" : "Agrandir la page du carnet"
            }
            aria-pressed={zoom}
            onClick={() => setZoom((v) => !v)}
          >
            {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
          </Button>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            aria-label="Fermer la page du carnet"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      <div
        ref={boxRef}
        className={cn(
          "min-h-0 flex-1 p-4",
          zoom ? "overflow-auto" : "flex items-center justify-center overflow-hidden",
        )}
      >
        <button
          type="button"
          onClick={() => setZoom((v) => !v)}
          aria-label={
            zoom ? "Ajuster la page à l’écran" : "Agrandir la page du carnet"
          }
          aria-pressed={zoom}
          className={cn(
            "flex items-center justify-center rounded-xl",
            zoom
              ? "h-full cursor-zoom-out"
              : "size-full flex-col gap-3 cursor-zoom-in",
          )}
        >
          {/* Le liseré : sur du papier crème, une page crème posée sur le fond
              clair perdait son bord (mesuré à 1,1:1 — la couture seule ne suffit
              pas en clair, alors qu’en sombre la page se détache toute seule).
              Le filet de champ est le trait le plus affirmé du système, et il
              est re-choisi dans les deux thèmes. */}
          <img
            src={pages[index]?.url}
            alt={`Page ${index + 1} du carnet du ${dateText}`}
            className={cn(
              "seam block rounded-xl border border-input",
              zoom
                ? "h-full w-auto max-w-none"
                : "min-h-0 max-h-full max-w-full object-contain",
            )}
          />
          {/* Le geste est écrit, juste sous la page : à l’état ajusté c’est la
              LARGEUR qui limite, il reste donc de la hauteur, et elle sert à
              dire comment lire de plus près plutôt qu’à rester vide. */}
          {!zoom && (
            <span className="shrink-0 text-meta text-muted-foreground">
              Touchez la page pour l’agrandir
            </span>
          )}
        </button>
      </div>

      {count > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-4 pt-3 pb-safe-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIndex((index - 1 + count) % count)}
          >
            <ChevronLeft aria-hidden="true" />
            Précédente
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIndex((index + 1) % count)}
          >
            Suivante
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------------------------
   La carte d’une journée.
   -------------------------------------------------------------------------- */

/** Lectures encore douteuses d’une journée : ce qui reste à corriger. */
function pendingCount(entry: Entry): number {
  if (!Array.isArray(entry.uncertainties)) return 0;
  return entry.uncertainties.filter((u) =>
    typeof u === "string" ? true : !u.resolved,
  ).length;
}

function StatusBadge({
  entry,
  canEdit,
}: {
  entry: Entry;
  /** Peut-on TRANCHER une lecture douteuse sur cette journée ? Cf. `access.ts`. */
  canEdit: boolean;
}) {
  if (entry.status === "draft")
    return (
      <Badge variant="warning">
        <PenLine aria-hidden="true" />À relire
      </Badge>
    );
  if (entry.status === "processing")
    return (
      <Badge variant="soft">
        <ScanLine aria-hidden="true" />
        Lecture en cours
      </Badge>
    );
  if (entry.status === "failed")
    return (
      <Badge variant="destructive">
        <TriangleAlert aria-hidden="true" />
        Échec
      </Badge>
    );
  /* UNE JOURNÉE PUBLIÉE PEUT RESTER FAUSSE, et le journal ne le disait pas.
     Une lecture non tranchée reste une lecture non tranchée après publication —
     c’est même le cas le plus fréquent : on publie vite le soir, on s’aperçoit
     de l’erreur en relisant. La pastille ambre est la MÊME que sur un brouillon
     (même teinte, même icône, même mot) parce qu’elle dit la même chose ; ce qui
     change, c’est la sortie au bas de la carte.

     ELLE NE S’ADRESSE QU’À QUI PEUT LA FAIRE DISPARAÎTRE. Sur le journal d’un
     LECTEUR, « 1 à vérifier » était une alarme sans interrupteur : mamie voit
     qu’un mot de la journée de sa petite-fille est douteux, ne peut pas
     l’arbitrer, et la pastille ambre reste là tous les soirs. Un avertissement
     qu’on ne peut pas lever n’est pas une information, c’est du bruit — et il
     annonçait une porte qui, pour elle, se refermait sur un 403. */
  if (entry.status === "published" && canEdit) {
    const n = pendingCount(entry);
    if (n > 0)
      return (
        <Badge variant="warning">
          <TriangleAlert aria-hidden="true" />
          {n} à vérifier
        </Badge>
      );
  }
  return null;
}

function EntryCard({
  entry,
  canEdit,
  onOpenPages,
}: {
  entry: Entry;
  /** Rôle contributeur ou administrateur sur CET enfant. Cf. `lib/access.ts`. */
  canEdit: boolean;
  onOpenPages: (entry: Entry, index: number, from: HTMLElement) => void;
}) {
  const dateText = fmtFull.format(dayOf(entry.date));
  const label = dayLabel(entry.date);
  const hasStory = Boolean(entry.story);
  const pending = pendingCount(entry);
  /* ── LA SORTIE DE LA CARTE — le cul-de-sac le plus coûteux de l’app ────────
     Mesuré : une journée PUBLIÉE n’avait AUCUN lien vers `/entries/:id`. Pour
     corriger un mot mal lu, il fallait passer par la cloche des notifications
     (et donc espérer que la notification soit encore dans les trente dernières),
     soit 2 taps + 1 panneau avant même de commencer à corriger — et zéro chemin
     du tout une fois la notification tombée hors de la liste. Le parcours C
     n’était pas cher : il était IMPOSSIBLE depuis l’écran où l’on repère
     l’erreur.
     Toutes les cartes portent maintenant la même sortie, au même endroit, dans
     le même objet. L’emphase, elle, suit l’urgence — et rien d’autre :
       échec / brouillon        → `secondary`, il y a un travail à finir ;
       publiée AVEC un doute    → `secondary`, il y a un mot à trancher ;
       publiée et confirmée     → `ghost`, la porte est là sans réclamer.

     ── ET ELLE N’EXISTE QUE POUR QUI PEUT LA FRANCHIR ──────────────────────
     Cette sortie était posée sur TOUTES les cartes, sans regarder le rôle. Un
     LECTEUR (la moitié des comptes d’un carnet partagé : mamie, le parrain)
     lisait « Corriger la lecture », arrivait dans l’éditeur complet, choisissait
     une suggestion, VOYAIT le texte changer, tapait « Republier la journée » —
     et recevait « accès refusé · rien n’est perdu : vos corrections sont
     toujours à l’écran », une promesse fausse pour elle à jamais. 2 taps perdus
     et un cul-de-sac, à chaque carte, tous les soirs.
     Le rôle vient de `/api/children` (`role` par enfant), pas de `/api/entries`
     qui ne renvoie que la ligne brute de l’enfant. Tant qu’il n’est pas connu,
     la porte n’est pas dessinée : on préfère la faire attendre 200 ms que
     l’ouvrir sur un refus. */
  const action = !canEdit
    ? null
    : entry.status === "failed"
      ? { label: "Reprendre cette journée", quiet: false }
      : entry.status === "draft"
        ? { label: "Relire et publier", quiet: false }
        : entry.status === "published"
          ? pending > 0
            ? { label: "Corriger la lecture", quiet: false }
            : { label: "Corriger la journée", quiet: true }
          : null;
  const shown = pickGlance(glanceOf(entry));

  /* ── Le récit tient sur TROIS lignes du cahier dans le fil ────────────────
     Mesuré avant : le récit faisait 10 lignes × 28 = 280 px, soit 35 % d’une
     carte de 803 px, et le premier écran (635 px de contenu sous 209 px de
     chrome) ne montrait donc rien d’autre : ni les pages photographiées, ni la
     ligne de dépli, ni le début de la journée suivante. Le fil coupe à 3 × 28 =
     84 px — un compte ENTIER d’interlignes, pour que la réglure du fond reste
     en phase avec le texte — et l’écran porte alors une pensée complète (jour,
     titre, feutres, trois lignes, temps fort, pages, dépli) PLUS 36 px de la
     journée suivante.

     La coupe a une sortie, et c’est la sortie qui existait déjà : le dépli. En
     l’ouvrant, le récit se déplie ET les moments apparaissent — un seul geste,
     un seul contrôle. Le texte coupé n’est caché qu’à l’ŒIL : `line-clamp` ne
     retire rien de l’arbre d’accessibilité, un lecteur d’écran lit la journée
     entière sans rien ouvrir. */
  const [open, setOpen] = useState(false);
  const storyRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = storyRef.current;
    if (!el || open) return;
    let alive = true;
    const measure = () => {
      if (alive) setClipped(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    // La mesure dépend de la fonte : si Nunito arrive après le premier rendu,
    // le nombre de lignes change et le libellé du dépli doit suivre.
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [entry.story, open]);

  const storyId = `recit-${entry.id}`;
  const detailId = `jour-${entry.id}`;

  return (
    <article
      // Cible du lien « Voir la journée » du reçu de publication : on republie
      // souvent une journée ancienne, donc plusieurs cartes plus bas.
      id={`carte-${entry.id}`}
      className="relative scroll-mt-28 overflow-hidden rounded-2xl border bg-card shadow-card"
    >
      {/* Le trait de marge du cahier, sur toute la hauteur de la feuille. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]"
      />

      <div className="relative flex flex-col gap-4 py-4 pr-5 pl-7">
        {/* En-tête : à qui, quand, d’où — un seul objet typographique, une
            seule ligne. La pastille d’état prend SON propre rang plutôt que de
            pousser la provenance à la ligne : une carte à relire ne doit pas
            avoir un en-tête d’une hauteur différente d’une carte publiée par
            accident de retour à la ligne. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            {/* `flex-wrap` : sur un écran de 320 px, un prénom long fait passer
                la date à la ligne au lieu de recouvrir la provenance. */}
            <p className="surtitre flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
              {entry.child && (
                <>
                  <span className="text-foreground">{entry.child.name}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                </>
              )}
              {/* `gap-1.5` (6 px) : l’écart optique entre un prénom, un point
                  médian et une date, pas un pas de mise en page. */}
              <time dateTime={entry.date} className="text-muted-foreground">
                {label}
              </time>
            </p>
            <p className="surtitre shrink-0 text-muted-foreground">
              {SOURCE_LABELS[entry.source]}
            </p>
          </div>
          <StatusBadge entry={entry} canEdit={canEdit} />
        </div>

        {entry.title && (
          // `text-balance` : un titre de deux lignes se répartit au lieu de
          // laisser un mot seul en seconde ligne.
          <h3 className="font-serif text-title font-semibold text-balance">
            {fr(entry.title)}
          </h3>
        )}

        <GlanceStrip stats={shown} />

        {/* Le récit : la seule chose posée sur les lignes du cahier. Le fond
            réglé déborde jusqu’aux bords de la feuille (marges négatives) pour
            que les lignes traversent la page comme sur un vrai cahier, tandis
            que le texte garde sa mesure de lecture.

            `measure` (34 rem) ne change rien à 390 px — la feuille est plus
            étroite — mais empêche le récit de traverser un écran de bureau,
            comme le dit le jeton depuis le début.
            `hyphens-auto` + `text-pretty` : à 308 px de colonne, la césure et
            l’équilibrage des dernières lignes sont ce qui reste pour resserrer
            un drapeau que la mesure ne peut pas élargir (mesuré : Nunito est
            déjà la fonte la plus étroite embarquée). */}
        {entry.story && (
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 pr-5 pl-7">
            <p
              id={storyId}
              ref={storyRef}
              className={cn(
                "carnet-story measure hyphens-auto text-pretty",
                !open && "line-clamp-3",
              )}
            >
              {fr(entry.story)}
            </p>
          </div>
        )}

        {entry.status === "processing" && (
          <div>
            {/* L’ATTENTE DIT CE QUI SE PASSE **ET CE QUI ARRIVE ENSUITE**.
                La phrase promettait déjà la première moitié ; la seconde était
                fausse jusqu’ici — le fil ne se rafraîchissait jamais, et la
                carte restait « Lecture en cours » jusqu’à un rechargement à la
                main (mesuré : +1 tap, et un tap qui n’existe même pas dans une
                PWA installée). Le journal sonde maintenant tant qu’une journée
                est en lecture (voir `refreshWhileReading`), donc la promesse est
                tenue et on peut l’écrire. */}
            <p role="status" className="text-ui text-muted-foreground">
              Racontine relit la page et écrit la journée. Cette carte se
              remplira toute seule — vous pouvez fermer l’app.
            </p>
            {/* La forme de la réponse qui arrive : un titre, trois lignes —
                exactement ce que la carte affichera. */}
            <div aria-hidden="true" className="mt-3">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton mt-4 h-4 w-full" />
              <div className="skeleton mt-3 h-4 w-full" />
              <div className="skeleton mt-3 h-4 w-2/3" />
            </div>
          </div>
        )}

        {entry.highlight && (
          // Marqué comme dans un vrai carnet : un trait groseille en marge du
          // passage. C’est le MÊME jeton que le trait de marge de la feuille
          // (`--rule-margin`), pas le groseille plein de l’action — la règle
          // « une couleur = un sens » tient, et le temps fort cesse d’être un
          // encart gris parmi d’autres.
          <div className="rounded-lg border-l-2 border-l-[var(--rule-margin)] bg-accent px-4 py-3">
            <p className="surtitre flex items-center gap-1.5 text-muted-foreground">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Le temps fort
            </p>
            <p className="mt-1 text-body text-pretty">{fr(entry.highlight)}</p>
          </div>
        )}

        {entry.status === "failed" && entry.failureReason && (
          <div className="flex items-start gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
            {/* `mt-0.5` = 2 px : le seul demi-pas de la carte, et c’est un
                centrage optique — une icône de 16 px sur une ligne de 20 px. */}
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p className="text-ui">{fr(entry.failureReason)}</p>
          </div>
        )}

        {/* Le dépli : la sortie de la coupe du récit ET la liste des moments.
            Il reste un `<details>` natif — clavier, recherche dans la page,
            « ouvrir tout » d’un outil de test — et c’est son basculement qui
            déplie le récit au-dessus. Un seul contrôle, deux effets, un libellé
            qui dit lequel : « Toute la journée » quand le récit est coupé,
            « Le détail du jour » quand il tient déjà. Les trois libellés sont
            COURTS par mesure : à 320 px la ligne dispose de 254 px et doit
            porter le libellé, le compteur (85 px) et le chevron sans passer à
            deux lignes — « Lire la journée entière » faisait 160 px et cassait. */}
        {hasStory ? (
          <details
            className="border-t"
            onToggle={(e) => setOpen(e.currentTarget.open)}
          >
            <summary
              aria-controls={
                entry.items.length > 0 ? `${storyId} ${detailId}` : storyId
              }
              className="flex min-h-11 cursor-pointer list-none items-center gap-3 pt-1 text-ui text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              <span className="flex-1">
                {open
                  ? "Replier"
                  : clipped
                    ? "Toute la journée"
                    : "Le détail du jour"}
              </span>
              {entry.items.length > 0 && (
                <span className="surtitre" data-tabular>
                  {entry.items.length} moment{entry.items.length > 1 ? "s" : ""}
                </span>
              )}
              {/* La rotation est pilotée par l’ÉTAT, pas par `group-open:` :
                  mesuré dans la feuille compilée, `group-open:rotate-180` ne
                  produit aucune règle CSS ici (Tailwind v4 ne compose pas le
                  variant `open` avec `group-*`), donc le chevron ne tournait
                  jamais — la seule chose qui disait « ouvert » était le
                  libellé. */}
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform dur-base ease-carnet",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </summary>
            {entry.items.length > 0 ? (
              <ul id={detailId} className="flex flex-col gap-3 pt-1 pb-2">
                {entry.items.map((it) => (
                  <ItemLine key={it.id} item={it} />
                ))}
                {entry.mood && <MoodLine mood={entry.mood} />}
              </ul>
            ) : (
              // Un dépli ne s’ouvre jamais sur rien : quand la page n’a livré
              // qu’un récit, il le dit.
              <p className="pt-1 pb-2 text-meta text-muted-foreground">
                Rien d’autre n’a été noté ce jour-là : la page ne portait que ce
                récit.
              </p>
            )}
          </details>
        ) : (
          entry.items.length > 0 && (
            <ul className="flex flex-col gap-3 border-t pt-4">
              {entry.items.map((it) => (
                <ItemLine key={it.id} item={it} />
              ))}
              {entry.mood && <MoodLine mood={entry.mood} />}
            </ul>
          )
        )}
        {/* Les pages photographiées FERMENT la carte, après le dépli — et
            l’ordre est mesuré, pas esthétique. Le CTA flottant occupe les 104
            derniers pixels de l’écran ; quand la bande de pages était la
            dernière, la ligne de dépli tombait dessous (740 contre 750) et la
            seule sortie de la carte se lisait à travers un dégradé. Renversés,
            c’est le BAS D’UNE IMAGE qui passe sous le fondu — où il n’y a aucun
            texte à voiler — et la sortie reste franche. La logique suit :
            au-dessus la journée recopiée, en dessous la page d’origine. */}
        {entry.attachments.length > 0 && (
          <PageStrip
            pages={entry.attachments}
            dateText={dateText}
            onOpen={(i, from) => onOpenPages(entry, i, from)}
          />
        )}
      </div>

      {action && (
        <div className="border-t px-5 py-3 pl-7">
          <Button
            asChild
            variant={action.quiet ? "ghost" : "secondary"}
            className={cn(
              "w-full",
              // La sortie discrète est au fer à gauche et pousse la flèche au
              // bord : elle se lit comme la dernière ligne de la page, pas comme
              // un second bouton d'appel.
              action.quiet && "justify-between text-muted-foreground",
            )}
          >
            <Link to={`/entries/${entry.id}`}>
              {action.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}

function MoodLine({ mood }: { mood: string }) {
  return (
    <li className="flex items-start gap-3 text-ui">
      <span
        aria-hidden="true"
        className="-mt-1 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
      >
        <Smile className="size-4" />
      </span>
      <span>
        <span className="font-bold">Humeur</span> — {fr(mood)}
      </span>
    </li>
  );
}

/* --------------------------------------------------------------------------
   Les trois états : chargement, vide, erreur.
   -------------------------------------------------------------------------- */

/**
 * Squelette : la forme exacte d’une journée, pas une roue qui tourne.
 *
 * Deux choses ont changé après mesure :
 *   · il ne fabrique plus un faux bandeau — le vrai est au-dessus, il est
 *     toujours là, et un squelette ne doit jamais mimer ce qui existe déjà ;
 *   · à la place du faux bandeau de mois, la LIGNE D’ÉTAT, au même endroit et
 *     au même cran (surtitre) que le mois qui viendra s’y écrire : le
 *     chargement dit ce qu’il fait, et au bout de trois secondes il dit qu’il
 *     est long — c’est la seule chose honnête à annoncer quand on ne connaît ni
 *     total ni progression (on ne chiffre pas ce qu’on ne sait pas).
 *   · le récit fantôme fait TROIS lignes, comme la carte réelle : avant il en
 *     annonçait quatre pour dix, donc la page sautait à l’arrivée des données.
 */
function JournalSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-11 items-end justify-between gap-3 border-b pb-2">
        <p role="status" className="surtitre text-muted-foreground">
          {slow ? "Le carnet met du temps à venir" : "Racontine ouvre le carnet"}
        </p>
        {/* Le point respire au MÊME rythme que les squelettes (la balayeuse de
            1200 ms déclarée dans index.css), au lieu d’introduire une seconde
            boucle d’animation pour dire la même chose. */}
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="relative overflow-hidden rounded-2xl border bg-card py-4 pr-5 pl-7 shadow-card"
        >
          <span className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]" />
          <div className="flex items-center justify-between gap-3">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-3 w-14" />
          </div>
          <div className="skeleton mt-4 h-6 w-4/5" />
          <div className="mt-4 flex gap-1.5">
            <div className="skeleton h-7 w-20" />
            <div className="skeleton h-7 w-28" />
            <div className="skeleton h-7 w-20" />
          </div>
          {/* Trois lignes au pas du cahier : le récit tel qu’il arrivera. */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/5" />
          </div>
          {i === 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="skeleton aspect-square" />
              <div className="skeleton aspect-square" />
            </div>
          )}
          {/* La ligne de dépli : elle fait partie de la forme de la réponse. */}
          <div className="mt-4 flex items-center gap-3 border-t pt-4">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton ml-auto h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Le vide MONTRE ce que l’app fabrique : une journée en pointillés, avec sa
 * marge, son titre à venir et ses feutres. Un rond et deux phrases ne vendent
 * rien — et c’est le premier écran d’un nouveau compte.
 */
function JournalEmpty({ canCapture }: { canCapture: boolean }) {
  /* LE VIDE D’UN LECTEUR N’EST PAS LE MÊME VIDE. Mamie n’a pas de carnet de
     papier à photographier : lui vendre le geste (« Photographiez la page du
     soir », « Inviter un proche ») serait lui promettre deux écrans qui la
     refuseront. Ce qu’elle attend, elle, c’est la première journée — et la seule
     chose honnête est de le dire, avec ce qui arrivera quand elle sera là. */
  if (!canCapture)
    return (
      <section className="rise-enter flex flex-col items-center gap-6 pt-2">
        <div
          aria-hidden="true"
          className="relative w-full overflow-hidden rounded-2xl border border-dashed bg-card py-4 pr-5 pl-7"
        >
          <span className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]" />
          <div className="flex items-baseline justify-between gap-3">
            <p className="surtitre text-muted-foreground">la première journée</p>
            <p className="surtitre text-muted-foreground">nounou</p>
          </div>
          <p className="mt-4 font-serif text-title font-semibold text-muted-foreground">
            Le titre de sa journée
          </p>
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 mt-4 pr-5 pl-7">
            <p className="carnet-story text-muted-foreground">
              Ce qu’il a mangé, comment il a dormi, ce qui l’a fait rire : le
              carnet du jour, recopié et mis en récit.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="font-serif text-title font-semibold text-balance">
            Aucune journée publiée pour l’instant
          </h2>
          <p className="max-w-[31ch] text-ui text-muted-foreground">
            Vous suivez ce carnet en lecture : dès qu’une journée est publiée,
            elle apparaît ici et vous en êtes prévenu·e.
          </p>
        </div>

        <ul className="flex w-full flex-col gap-3">
          <Tip Icon={BookOpenText}>
            Rien à faire : le journal se remplit tout seul, au fil des soirs.
          </Tip>
          <Tip Icon={Sparkles}>
            Chaque journée est relue par la famille avant d’être partagée.
          </Tip>
        </ul>
      </section>
    );

  return (
    <section className="rise-enter flex flex-col items-center gap-6 pt-2">
      <div
        aria-hidden="true"
        className="relative w-full overflow-hidden rounded-2xl border border-dashed bg-card py-4 pr-5 pl-7"
      >
        <span className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]" />
        <div className="flex items-baseline justify-between gap-3">
          {/* Pas de prénom inventé ici : un compte neuf n’a pas de Louise. */}
          <p className="surtitre text-muted-foreground">aujourd’hui</p>
          <p className="surtitre text-muted-foreground">nounou</p>
        </div>
        <p className="mt-4 font-serif text-title font-semibold text-muted-foreground">
          Le titre que Racontine trouvera
        </p>
        <div className="mt-4 flex gap-1.5">
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-meal-bg px-2 text-meta font-bold text-meal">
            <Soup className="size-4" />3 repas
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-nap-bg px-2 text-meta font-bold text-nap">
            <Moon className="size-4" />
            sieste 2{NBSP}h{NBSP}05
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-meta font-bold text-foreground">
            <Smile className="size-4" />
            joyeuse
          </span>
        </div>
        {/* La zone réglée porte une vraie phrase, pas de fausses lignes de
            crayon : elle explique ce qui viendra s’écrire là, et elle montre
            en même temps le récit posé sur les lignes du cahier. */}
        <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 mt-4 pr-5 pl-7">
          <p className="carnet-story text-muted-foreground">
            Le récit de la journée, écrit à partir de votre photo : ce qu’il a
            mangé, comment il a dormi, ce qui l’a fait rire.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        {/* `h2` et non `h1` : le bandeau « Le journal » est toujours là
            au-dessus, et il ne dit plus deux fois le même mot. */}
        <h2 className="font-serif text-title font-semibold text-balance">
          Votre journal commence par une photo
        </h2>
        <p className="max-w-[31ch] text-ui text-muted-foreground">
          Photographiez la page du soir : Racontine la transcrit et en fait un
          souvenir à lire et à partager.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-3">
        <Tip Icon={Camera}>
          Une photo de travers, un peu froissée, suffit. La page entière dans le
          cadre, c’est tout.
        </Tip>
        <Tip Icon={Sparkles}>
          Vous relisez avant publication : rien n’est partagé sans votre accord.
        </Tip>
      </ul>

      <div className="flex w-full flex-col gap-3">
        <Button asChild size="lg">
          <Link to="/capture">
            <Camera aria-hidden="true" />
            Photographier le carnet
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/partage">
            <Users aria-hidden="true" />
            Inviter un proche
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Tip({
  Icon,
  children,
}: {
  Icon: typeof Camera;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-meta text-muted-foreground">{children}</span>
    </li>
  );
}

/**
 * Le petit code posé sur la ligne « Détail technique » : ce qu’on SAIT, jamais
 * plus. Un statut HTTP s’il est dans le message (`api.ts` remonte « Erreur 500 »
 * quand le serveur ne renvoie pas de phrase), sinon la nature de la panne, sinon
 * la requête qui a échoué — c’est la seule chose vraie qui reste, et elle suffit
 * à ouvrir un journal de serveur au bon endroit.
 */
function technicalCode(message: string): string {
  const http = message.match(/\b([45]\d{2})\b/);
  if (http) return `HTTP ${http[1]}`;
  if (/connexion|réseau|fetch/i.test(message)) return "réseau";
  return "GET /api/entries";
}

/**
 * L’erreur nomme la CAUSE, le REMÈDE, et laisse deux sorties. Elle ne dit
 * surtout pas « le journal est vide » : les journées sont là, c’est l’accès
 * qui a échoué, et confondre les deux est le pire mensonge possible ici.
 */
function JournalError({
  message,
  canCapture,
  onRetry,
}: {
  message: string;
  /** Un lecteur n’a pas de seconde sortie « photographier » : elle le refuserait. */
  canCapture: boolean;
  onRetry: () => void;
}) {
  const [detail, setDetail] = useState(false);
  return (
    <section
      /* La hauteur retirée est celle du chrome + du bandeau (11 rem mesurés) :
         le bloc se centre dans ce qui RESTE de l’écran, au lieu de se centrer
         dans 60 % de l’écran et de laisser 280 px de papier vide dessous. */
      className="rise-enter flex min-h-[calc(100svh-11rem)] flex-col items-center justify-center gap-5 text-center"
    >
      <span className="grid size-16 place-items-center rounded-3xl bg-destructive-soft text-destructive">
        <CloudOff className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          Le journal ne répond pas
        </h2>
        {/* Plus de tiret cadratin en tête de ligne : « Réessayez — si cela
            persiste » se coupait entre les deux, et une ligne qui commence par
            un cadratin se lit comme un dialogue de roman. Deux phrases. */}
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Vos journées sont intactes : c’est la connexion au carnet qui a
          échoué. Réessayez ; si cela persiste, le serveur Racontine est
          peut-être en train de redémarrer.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        {/* Pas d’état « en cours » sur ce bouton : la nouvelle tentative rend
            aussitôt le squelette, qui dit mieux que lui ce qui se passe. */}
        <Button onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Réessayer
        </Button>
        {canCapture && (
          <Button asChild variant="outline">
            <Link to="/capture">
              <Camera aria-hidden="true" />
              Photographier le carnet
            </Link>
          </Button>
        )}
      </div>
      {/* Le code brut est ANNONCÉ sur la ligne, pas seulement derrière elle :
          un développeur reconnaît « 500 » sans ouvrir, et un parent voit qu’il
          y a une pièce technique sans avoir à la lire. La ligne reste à 44 px. */}
      <details
        className="w-full text-left"
        onToggle={(e) => setDetail(e.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-meta text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform dur-base ease-carnet",
              detail && "rotate-180",
            )}
            aria-hidden="true"
          />
          <span className="flex-1">Détail technique</span>
          <span
            className="flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 text-meta text-muted-foreground"
            data-tabular
          >
            {technicalCode(message)}
          </span>
        </summary>
        <p className="mt-2 rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground">
          {message}
        </p>
      </details>
    </section>
  );
}

/* --------------------------------------------------------------------------
   LE REÇU — ce qui manquait à la fin de chaque parcours.

   Mesuré sur les trois parcours : publier une journée, la republier après
   correction, rejoindre un carnet sur invitation aboutissaient tous les trois
   au MÊME écran muet. `nav("/")`, et débrouillez-vous : rien ne disait que la
   journée était partie, que les proches étaient prévenus, ni qu’on venait
   d’entrer dans un cercle. C’est un cul-de-sac après succès — le pire endroit
   pour en mettre un, parce que c’est le moment où l’on vérifie qu’on a bien
   fait ce qu’on croyait faire.

   Le reçu est donc porté par l’écran d’arrivée, pas par une bulle flottante :
     · il est ANNONCÉ (`role="status"`), donc lu par un lecteur d’écran ;
     · il nomme la CONSÉQUENCE (les proches sont prévenus), pas seulement le
       fait ;
     · il donne la SUITE (voir la journée), jamais un simple « OK » ;
     · il se referme d’un tap de 44 px, et l’état d’historique est effacé pour
       qu’un rechargement ne le fasse pas réapparaître.
   Il ne clignote pas et ne disparaît pas tout seul : un reçu qui s’évapore au
   bout de trois secondes est un reçu qu’on n’a pas eu le temps de lire.
   -------------------------------------------------------------------------- */

/** Ce qu’un écran précédent a laissé dans l’état de navigation. */
type Flash =
  | {
      kind: "published";
      entryId: string;
      title: string | null;
      childName: string | null;
      again: boolean;
    }
  | { kind: "joined"; childName: string; role: string };

function readFlash(state: unknown): Flash | null {
  if (!state || typeof state !== "object") return null;
  const s = state as Record<string, unknown>;
  if (s.published && typeof s.published === "object") {
    const p = s.published as Record<string, unknown>;
    if (typeof p.entryId !== "string") return null;
    return {
      kind: "published",
      entryId: p.entryId,
      title: typeof p.title === "string" ? p.title : null,
      childName: typeof p.childName === "string" ? p.childName : null,
      again: p.again === true,
    };
  }
  if (s.joined && typeof s.joined === "object") {
    const j = s.joined as Record<string, unknown>;
    if (typeof j.childName !== "string") return null;
    return {
      kind: "joined",
      childName: j.childName,
      role: typeof j.role === "string" ? j.role : "reader",
    };
  }
  return null;
}

function Receipt({
  flash,
  onClose,
}: {
  flash: Flash;
  onClose: () => void;
}) {
  const published = flash.kind === "published";
  const title = published
    ? flash.again
      ? "Journée republiée"
      : "Journée publiée"
    : `Bienvenue dans le carnet de ${flash.childName}`;
  const body = published
    ? flash.again
      ? "La correction est en ligne : vos proches lisent la version à jour."
      : "Vos proches sont prévenus : ils la trouveront dans leur journal."
    : "Vous y êtes. Les journées publiées apparaîtront ici, de la plus récente à la plus ancienne.";

  return (
    <div
      role="status"
      /* Vert = acquis, comme partout ailleurs dans le produit (les pages
         gardées de la capture, le pas franchi de la barre d’envoi). Le reçu
         n’invente aucune teinte. */
      className="rise-enter flex items-start gap-3 rounded-2xl border border-success bg-success-bg px-4 py-3"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-success text-background"
      >
        {published ? (
          <Send className="size-4" />
        ) : (
          <BookOpenText className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {/* PAS DE TITRE DE JOURNÉE ICI, et c'est mesuré : la première version
            reprenait « Le jour des haricots verts » en 22/28 sérif, si bien que
            le titre s'écrivait DEUX FOIS à 100 px d'écart (une fois dans le
            reçu, une fois sur la carte juste dessous) et que le reçu faisait
            390 px — il repoussait sous la ligne de flottaison la seule chose
            qu'on venait vérifier, la journée elle-même. Le reçu confirme, la
            carte nomme. 130 px, deux lignes et une suite. */}
        <p className="text-ui font-bold text-success">{title}</p>
        <p className="mt-0.5 text-meta text-success">{body}</p>
        {published && (
          <Button
            variant="link"
            size="sm"
            className="-ml-3 mt-1 text-success"
            /* Le titre part dans le libellé accessible : « Voir la journée »
               seul ne dit pas laquelle, et le reçu ne l'écrit plus en gros. */
            aria-label={
              flash.title ? `Voir la journée « ${flash.title} »` : undefined
            }
            onClick={() => {
              const el = document.getElementById(`carte-${flash.entryId}`);
              el?.scrollIntoView({
                block: "start",
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              });
            }}
          >
            Voir la journée
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Fermer le message"
        className="-mr-2 shrink-0 text-success"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type Viewer = { pages: AttachmentRef[]; index: number; date: string };

export default function Timeline() {
  const location = useLocation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  /* ── LE RÔLE, PAR ENFANT ──────────────────────────────────────────────────
     `null` = « on ne sait pas encore » (ou `/api/children` a échoué), et ce
     troisième état est le point important : il ne se lit pas comme « lecteur »
     partout.
       · pour la PORTE de correction d’une carte → on ne dessine rien. Un
         contributeur retrouve sa journée 200 ms plus tard ; un lecteur, lui, ne
         doit jamais voir la porte, même une frame.
       · pour l’APPEL à photographier → on le laisse. L’écran de capture porte
         désormais le même garde-fou et sait, lui, l’expliquer ; le supprimer
         par prudence retirerait le geste central du produit à un parent dont la
         seule requête ayant échoué est la liste des enfants. */
  const [roleByChild, setRoleByChild] = useState<Map<string, MemberRole> | null>(
    null,
  );
  const openerRef = useRef<HTMLElement | null>(null);
  /* Le reçu laissé par l’écran d’où l’on vient (publication, adhésion). Lu UNE
     fois, à l’initialisation : ensuite l’état d’historique est effacé, sinon un
     rechargement rejouerait « Journée publiée » indéfiniment. */
  const [flash, setFlash] = useState<Flash | null>(() =>
    readFlash(location.state),
  );
  useEffect(() => {
    if (!location.state) return;
    // `usr` est la case où react-router range l’état utilisateur ; on la vide
    // sans toucher à sa clé d’index, pour ne pas casser l’historique.
    const h = window.history.state as Record<string, unknown> | null;
    window.history.replaceState({ ...(h ?? {}), usr: null }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (offset: number) => {
    const res = await api.timeline({ offset, limit: 20 });
    setEntries((prev) => {
      if (offset === 0) return res.entries;
      // Pagination par offset : si une entrée a été publiée entre deux
      // chargements, la fenêtre glisse et peut renvoyer une entrée déjà
      // affichée. On dédoublonne par id pour éviter cartes en double et clés
      // React dupliquées.
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...res.entries.filter((e) => !seen.has(e.id))];
    });
    setNextOffset(res.nextOffset);
  }, []);

  const reload = useCallback(async () => {
    setPhase((p) => (p === "error" ? "loading" : p));
    try {
      /* Les deux requêtes partent ENSEMBLE (pas l’une après l’autre : ce serait
         deux allers-retours avant le premier pixel), et le fil n’attend pas les
         rôles pour s’afficher — mais les rôles, eux, arrivent presque toujours
         avant, la réponse étant une poignée de lignes. Un échec sur
         `/api/children` ne casse PAS le journal : on garde `null`, cf. ci-dessus. */
      void api.listChildren().then(
        (list) => setRoleByChild(roleMap(list)),
        () => setRoleByChild(null),
      );
      await load(0);
      setPhase("ready");
    } catch (e) {
      // L’erreur est CONSERVÉE : elle est la cause qu’on affichera.
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ── LE FIL SUIT LA LECTURE EN COURS ──────────────────────────────────────
     L’écran d’attente de la relecture propose « Revenir au journal » — et c’est
     la bonne offre : une lecture peut prendre trente secondes, personne ne doit
     rester à regarder une barre. Sauf que le journal, lui, ne sondait rien : la
     carte restait « Lecture en cours » pour toujours. Mesuré : la seule sortie
     était de recharger la page (+1 tap, et un geste qui n’existe pas dans une
     PWA installée en plein écran).
     On sonde donc tant qu’une journée est en lecture, et seulement à ce
     moment-là : pas de trafic quand il n’y a rien à attendre.
       · 4 s : plus lent que les 2,5 s de la relecture (qui, elle, regarde UNE
         journée), assez rapide pour qu’on ne se demande pas si c’est bloqué ;
       · onglet caché → on ne demande rien, mais on repart au retour ;
       · échec réseau → SILENCE : le fil affiché reste vrai, et faire surgir une
         erreur pendant un sondage de fond punirait l’utilisateur d’avoir
         attendu. La panne se dira au prochain geste explicite.
     La fusion préserve la pagination : `load(0)` remplace la liste entière et
     ferait disparaître les « journées précédentes » déjà chargées. */
  const refreshWhileReading = useCallback(async () => {
    const res = await api.timeline({ offset: 0, limit: 20 });
    setEntries((prev) => {
      const fresh = new Map(res.entries.map((e) => [e.id, e]));
      const merged = prev.map((e) => fresh.get(e.id) ?? e);
      const known = new Set(prev.map((e) => e.id));
      const added = res.entries.filter((e) => !known.has(e.id));
      return added.length ? [...added, ...merged] : merged;
    });
  }, []);

  const reading = entries.some((e) => e.status === "processing");

  useEffect(() => {
    if (phase !== "ready" || !reading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) {
        try {
          await refreshWhileReading();
        } catch {
          /* silencieux, cf. la note ci-dessus */
        }
      }
      if (alive) timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 4000);
    const wake = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [phase, reading, refreshWhileReading]);

  async function loadMore(offset: number) {
    setMore(true);
    setMoreError("");
    try {
      await load(offset);
    } catch (e) {
      setMoreError(
        e instanceof Error
          ? e.message
          : "Les journées précédentes n’ont pas pu être chargées.",
      );
    } finally {
      setMore(false);
    }
  }

  function openPages(entry: Entry, index: number, from: HTMLElement) {
    openerRef.current = from;
    setViewer({ pages: entry.attachments, index, date: entry.date });
  }

  function closeViewer() {
    setViewer(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  /** Les journées regroupées par mois : la colonne vertébrale des dates. */
  const months = useMemo(() => {
    const groups: { key: string; label: string; entries: Entry[] }[] = [];
    for (const e of entries) {
      const key = e.date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else
        groups.push({
          key,
          label: fmtMonthYear.format(dayOf(e.date)),
          entries: [e],
        });
    }
    return groups;
  }, [entries]);

  const hasJournal = phase === "ready" && entries.length > 0;

  /** Tient-on au moins un carnet ? Rôle inconnu → oui, cf. `roleByChild`. */
  const canCapture =
    roleByChild === null ||
    [...roleByChild.values()].some((r) => canWrite(r)) ||
    roleByChild.size === 0;

  return (
    <div className="shell-width flex flex-col gap-4 px-4 pt-4 pb-8">
      {/* Le bandeau : la coquille porte le nom de l’INSTANCE, cette ligne porte
          le nom de l’ÉCRAN, au seul cran 30/36 de la page.

          DEUX CORRECTIONS, toutes deux mesurées :

          · PLUS DE SOUS-TITRE. « Louise et Gaspard » redisait le « LOUISE · »
            que porte déjà le surtitre de chaque carte, et c’était le seul nœud
            en 15/20 d’un bloc de 60 px. Sans lui, le bandeau fait 36 px et le
            chrome au-dessus de la première carte tombe de 209 à 185 px, soit
            21,9 % de l’écran — sous le plafond de 22 %.
          · IL NE DISPARAÎT PLUS. Il était conditionné à `hasJournal` : l’écran
            perdait son titre exactement dans les trois moments où l’on est le
            plus perdu (chargement, vide, erreur), et la page passait de 6 à 4
            crans typographiques. Le titre d’un écran ne dépend pas de ses
            données. */}
      <header>
        <h1 className="font-serif text-display font-semibold">Le journal</h1>
      </header>

      {/* Le reçu est SOUS le titre et AU-DESSUS du fil : c’est la première chose
          qu’on lit en arrivant, et il ne recouvre rien. Il s’affiche même quand
          le journal charge encore — la confirmation ne dépend pas du réseau. */}
      {flash && <Receipt flash={flash} onClose={() => setFlash(null)} />}

      {phase === "loading" && <JournalSkeleton />}

      {phase === "error" && (
        <JournalError
          message={error}
          canCapture={canCapture}
          onRetry={reload}
        />
      )}

      {phase === "ready" && entries.length === 0 && (
        <JournalEmpty canCapture={canCapture} />
      )}

      {/* Les mois ne s’affichent QUE dans l’état prêt : une nouvelle tentative
          qui échoue ne doit pas laisser un journal périmé sous le message
          d’erreur. */}
      {phase === "ready" &&
        months.map((m) => (
          <section key={m.key} aria-labelledby={`mois-${m.key}`}>
            {/* Le bandeau de mois reste collé sous l’en-tête : où qu’on soit dans
              le défilement, on sait quel mois on lit. */}
            <div className="sticky top-header z-10 -mx-4 bg-surface-bar px-4 backdrop-blur-md">
              <div className="flex h-11 items-end justify-between gap-3 border-b pb-2">
                <h2
                  id={`mois-${m.key}`}
                  className="surtitre text-muted-foreground"
                >
                  {m.label}
                </h2>
                <p className="surtitre text-muted-foreground" data-tabular>
                  {m.entries.length} journée{m.entries.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <ol className="mt-4 flex flex-col gap-4">
              {m.entries.map((e) => (
                <li key={e.id}>
                  <EntryCard
                    entry={e}
                    canEdit={canWrite(roleByChild?.get(e.childId))}
                    onOpenPages={openPages}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}

      {moreError && (
        <p className="rounded-lg bg-destructive-soft px-4 py-3 text-meta text-destructive">
          {moreError}
        </p>
      )}

      {hasJournal && nextOffset !== null && (
        <Button
          variant="outline"
          loading={more}
          onClick={() => loadMore(nextOffset)}
        >
          Voir les journées précédentes
        </Button>
      )}

      {/* Le carnet ne s’arrête pas net : il s’efface. */}
      {hasJournal && (
        /* `pb-32` réserve la place du bouton flottant. Sans bouton (lecteur), la
           réserve deviendrait 128 px de papier vide sous la dernière ligne. */
        <p
          className={cn(
            "surtitre pt-2 text-center text-muted-foreground",
            canCapture ? "pb-32" : "pb-2",
          )}
        >
          {entries.length} journée{entries.length > 1 ? "s" : ""} dans le carnet
        </p>
      )}

      {/* CTA flottant sur un fondu vers le papier : le contenu s’efface
          doucement dessous au lieu de buter contre le bouton. Il ne s’affiche
          qu’avec un journal : dans le vide et dans l’erreur, l’action est déjà
          au centre de l’écran, et deux boutons primaires n’en font aucun.
          ET il ne s’affiche pas pour un LECTEUR : le seul bouton groseille de
          l’écran ne peut pas être celui d’un écran qui la refuse. */}
      {hasJournal && canCapture && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-background via-surface-bar to-transparent px-4 pt-8 pb-safe-6">
          <Button
            asChild
            size="lg"
            className="shell-width pointer-events-auto shadow-lift"
          >
            <Link to="/capture">
              <Camera aria-hidden="true" />
              Photographier le carnet
            </Link>
          </Button>
        </div>
      )}

      {viewer && (
        <PageViewer
          pages={viewer.pages}
          index={viewer.index}
          date={viewer.date}
          onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
