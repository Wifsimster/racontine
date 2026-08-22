import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  Baby,
  BookOpenText,
  Camera,
  Check,
  ChevronDown,
  FileText,
  HeartPulse,
  Images,
  Moon,
  PenLine,
  Plus,
  RotateCcw,
  RotateCw,
  ScanLine,
  Send,
  Smile,
  Soup,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { canWrite, roleMap } from "@/lib/access";
import {
  type AttachmentRef,
  type BatchEntrySummary,
  type Entry,
  type EntryItem,
  type ItemType,
  type EntrySource,
  type MemberRole,
  type Uncertainty,
  type UncertaintyField,
  ITEM_LABELS,
  SOURCE_LABELS,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DayStepper } from "@/components/DayStepper";
import { CaptureSteps, type Step } from "@/components/CaptureSteps";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ===========================================================================
   LA RELECTURE — l'écran de la confiance.

   Une machine a lu une page manuscrite ; un humain doit pouvoir dire « oui »
   en quelques secondes. Trois décisions tiennent tout l'écran :

   1. LA CONFIANCE EST LA SEULE DIMENSION COLORÉE. Ambre = « à vérifier »,
      vert = « confirmé », groseille = l'action, et RIEN d'autre n'a de
      couleur : les cinq feutres de catégorie (repas, sieste…) passent
      volontairement en gris ici (voir lib/ui.ts). Deux systèmes de couleur sur
      le même écran, et plus aucun ne veut dire quelque chose.
   2. CE QUI DEMANDE UN HUMAIN EST AU-DESSUS DE LA LIGNE DE FLOTTAISON. Avant,
      le premier écran ne montrait qu'un stepper et une photo de carnet plein
      cadre : il fallait scroller pour découvrir qu'il y avait quoi que ce soit
      à corriger. Désormais la photo est une SOURCE (repliée sur mobile,
      colonne collante sur grand écran) et les lectures incertaines viennent
      juste après l'en-tête.
   3. ON VOIT CE QU'ON S'APPRÊTE À PUBLIER. C'était le défaut de fond de la
      version précédente : les cinq moments structurés — les repas, les
      siestes, les activités, c'est-à-dire la SUBSTANCE d'un carnet de liaison —
      dormaient dans un dépli « secondaire » à 1 800 px du haut du document. On
      pouvait appuyer sur « Publier la journée » sans avoir jamais vu ni le
      déjeuner ni la sieste. Ils sont maintenant en clair, juste sous les
      lectures à vérifier, en LISTE DE COUP D'ŒIL non modifiable : une ligne de
      56 px par moment, libellé + valeur + état (« à vérifier » / « confirmé »).
      Le dépli reste, mais il ne sert plus qu'à CORRIGER.
   4. LA SOURCE ET LA JOURNÉE SONT MISES EN REGARD. Le panneau de gauche a deux
      onglets — la page photographiée et la transcription mot à mot — face à la
      journée réécrite à droite : on peut confronter ce qui est écrit sur le
      papier et ce qui sera publié, sans quitter l'écran.
   5. UNE SEULE INCERTITUDE EST OUVERTE À LA FOIS. Deux cartes dépliées de
      210 px mangeaient toute la hauteur utile ; et une fois la première
      tranchée, la deuxième s'ouvre d'elle-même. Les autres se replient en
      lignes de 56 px qui disent quand même le mot lu et où il se trouve.

   LA BARRE D'ACTION NE PORTE QU'UNE DÉCISION, et elle est OPAQUE. À 0,88
   d'alpha, dix nœuds de texte se lisaient encore à travers elle sans être
   cliquables : un fantôme légible est un mensonge. Elle est passée de 157 px à
   101 px (une ligne de conséquence + le bouton), ce qui ramène le chrome de
   25,4 % à 18,7 % de l'écran — sous le plafond de 22 %. « Enregistrer le
   brouillon » descend en bas de la colonne : c'est une action d'appoint, pas
   une décision.

   Les quatre états sont dessinés (I7) : squelette à la forme de la réponse,
   lecture en cours (progression réelle : page N sur M), échec de lecture et
   échec d'accès — chacun avec sa cause, son remède, ses sorties et le code
   brut sur demande. Rien n'affiche jamais une exception nue.
   =========================================================================== */

type DraftItem = { type: ItemType; data: Record<string, string>; position: number };

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

/** Même glyphe par type de moment que sur le journal — mais en gris ici. */
const ITEM_ICON: Record<ItemType, typeof Soup> = {
  meal: Soup,
  nap: Moon,
  activity: Sparkles,
  anecdote: Baby,
  health: HeartPulse,
};

/**
 * Ce qu'une ligne de coup d'œil dit d'un moment : son libellé (le moment du
 * repas, « Sieste »…) et sa valeur en une phrase. C'est volontairement une
 * PROJECTION, pas un formulaire : on lit, on ne corrige pas ici.
 */
function glanceOf(it: DraftItem): { label: string; value: string } {
  const d = it.data;
  const j = (...parts: (string | undefined)[]) =>
    parts
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(" · ");
  switch (it.type) {
    case "meal":
      return {
        label: d.moment?.trim() || ITEM_LABELS.meal,
        value: j(d.contenu, d.appetit),
      };
    case "nap": {
      const span =
        d.debut?.trim() && d.fin?.trim()
          ? `${d.debut.trim()} → ${d.fin.trim()}`
          : (d.debut?.trim() || d.fin?.trim() || "");
      return { label: ITEM_LABELS.nap, value: j(span, d.note) };
    }
    case "activity":
      return { label: ITEM_LABELS.activity, value: j(d.label) };
    case "anecdote":
      return { label: ITEM_LABELS.anecdote, value: j(d.text) };
    case "health":
      return { label: ITEM_LABELS.health, value: j(d.note) };
  }
}

/** Où se trouve le mot incertain : dit à l'œil où regarder. */
const FIELD_ORIGIN: Record<UncertaintyField, string> = {
  titre: "dans le titre",
  recit: "dans le récit",
  temps_fort: "dans le temps fort",
  transcription_integrale: "dans la transcription",
};

function toDraftItems(items: EntryItem[]): DraftItem[] {
  return items.map((it, i) => ({
    type: it.type,
    data: { ...(it.data as Record<string, string>) },
    position: it.position ?? i,
  }));
}

const EMPTY: Record<ItemType, Record<string, string>> = {
  meal: { moment: "", contenu: "", appetit: "" },
  nap: { debut: "", fin: "", note: "" },
  activity: { label: "" },
  anecdote: { text: "" },
  health: { note: "" },
};

const fmtWeekdayDayMonth = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtWeekdayDayMonth.format(d);
}

/**
 * Le mot lu s'affiche partout entre guillemets français, posés par l'écran. Une
 * lecture qui arrive DÉJÀ citée — le modèle en met parfois, d'anciennes journées
 * en gardent — se retrouvait donc « « Roueil » » : deux paires de guillemets
 * pour un mot. Le serveur nettoie la donnée (server/src/uncertainties.ts) ; ceci
 * est le filet d'affichage, pour que l'écran ne double jamais la ponctuation
 * quoi qu'on lui serve.
 */
function unquoted(text: string): string {
  let t = (text ?? "").trim();
  const pairs: [string, string][] = [
    ["«", "»"],
    ["\u201c", "\u201d"],
    ['"', '"'],
  ];
  for (let pass = 0; pass < 3; pass++) {
    const pair = pairs.find(
      ([open, close]) =>
        t.length > 2 &&
        t.startsWith(open) &&
        t.endsWith(close) &&
        !t.slice(1, -1).includes(close),
    );
    if (!pair) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Échappe un mot lu sur un carnet pour l'insérer tel quel dans une regex. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Un mot encore douteux marque « à vérifier » les lignes de la journée qui le
 * contiennent — mais EN TANT QUE MOT. La recherche était une sous-chaîne :
 * « eau » marquait « beaucoup », « thé » marquait « méthode », et une lecture
 * douteuse de trois lettres suffisait à saupoudrer d'ambre une journée entière.
 * Les bornes sont des non-lettres/non-chiffres Unicode, pas `\b` : `\b` place une
 * frontière au milieu de « goûter » (le « û » n'est pas un caractère de mot).
 */
function wordMatcher(token: string): RegExp | null {
  const t = unquoted(token);
  if (!t) return null;
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t)}([^\\p{L}\\p{N}]|$)`, "iu");
  } catch {
    return null;
  }
}

/**
 * Met en gras le mot douteux à l'intérieur de son contexte : on voit d'un coup
 * d'œil OÙ le doute se trouve dans la phrase, sans relire la phrase.
 *
 * La recherche se fait EN TANT QUE MOT et HORS CASSE (mêmes bornes Unicode que
 * `wordMatcher`) : un `split` sur la chaîne exacte ne trouvait pas « Écrite »
 * quand la lecture douteuse est « écrite », et mettait en gras le milieu de
 * « beaucoup » quand elle est « eau ». Le mot est réémis TEL QU'IL EST ÉCRIT
 * dans la phrase — c'est cette forme-là qu'on va chercher sur la photo.
 */
function highlightToken(text: string, token: string): React.ReactNode {
  const t = unquoted(token);
  if (!t) return text;
  let re: RegExp;
  try {
    re = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${escapeRe(t)})([^\\p{L}\\p{N}]|$)`,
      "giu",
    );
  } catch {
    return text;
  }
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start < last) continue;
    out.push(text.slice(last, start));
    out.push(
      <span key={start} className="font-bold text-foreground">
        {m[2]}
      </span>,
    );
    last = start + m[2].length;
  }
  if (!out.length) return text;
  out.push(text.slice(last));
  return out;
}

/* ── OÙ CE MOT A-T-IL ÉTÉ LU ? ──────────────────────────────────────────────
   La carte donnait le mot douteux seul (« écrite ») et, quand le modèle en
   fournissait une, une glose (« mot incertain après «Nounour» »). Devant deux
   pages de cursive photographiées, retrouver CE mot-là demandait de relire tout
   le carnet : le seul repère était une périphrase écrite par la machine.
   On affiche donc la PHRASE de la transcription qui porte le mot, mot en gras.
   C'est la même suite de mots que sur le papier — l'œil la retrouve d'un
   balayage, parce qu'il cherche une ligne, plus un mot isolé. */

/** Au-delà, ce n'est plus un repère : c'est un paragraphe à relire. */
const PHRASE_MAX = 150;

/** Ce qui ferme une phrase sur un carnet : la ponctuation forte, ou la réglure
    suivante (les cahiers de nounou sont écrits en lignes, pas en phrases). */
const PHRASE_BOUND = /[.!?;\n\r]/;

/**
 * Recentre une phrase trop longue AUTOUR du mot, sur des espaces (jamais au
 * milieu d'un mot), et signale ce qui a été coupé par une ellipse.
 */
function clipAround(phrase: string, token: string): string {
  if (phrase.length <= PHRASE_MAX) return phrase;
  const at = phrase.toLowerCase().indexOf(token.toLowerCase());
  if (at < 0) return `${phrase.slice(0, PHRASE_MAX).trimEnd()} …`;
  let start = Math.max(0, at - Math.round((PHRASE_MAX - token.length) / 2));
  let end = Math.min(phrase.length, start + PHRASE_MAX);
  if (start > 0) {
    const sp = phrase.indexOf(" ", start);
    if (sp !== -1 && sp < at) start = sp + 1;
  }
  if (end < phrase.length) {
    const sp = phrase.lastIndexOf(" ", end);
    if (sp > at + token.length) end = sp;
  }
  return `${start > 0 ? "… " : ""}${phrase.slice(start, end).trim()}${
    end < phrase.length ? " …" : ""
  }`;
}

/**
 * La phrase d'un texte qui contient le mot douteux, ou `null` s'il n'y figure
 * pas. Une phrase qui se réduit au mot lui-même ne repère rien de plus que la
 * carte : elle vaut `null` elle aussi.
 */
function phraseAround(text: string, token: string): string | null {
  const t = unquoted(token);
  if (!t || !text) return null;
  const re = wordMatcher(t);
  if (!re) return null;
  const m = re.exec(text);
  if (!m) return null;
  const at = (m.index ?? 0) + m[1].length;

  const left = text.slice(0, at);
  const cut = /[.!?;\n\r][^.!?;\n\r]*$/.exec(left);
  const start = cut ? cut.index + 1 : 0;
  const right = text.slice(at + t.length);
  const stop = PHRASE_BOUND.exec(right);
  /* La ponctuation forte fait partie de la phrase, le retour à la ligne non. */
  const end =
    at +
    t.length +
    (stop ? stop.index + (stop[0] === "\n" || stop[0] === "\r" ? 0 : 1) : right.length);

  const phrase = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (!phrase || phrase.length <= t.length + 1) return null;
  return clipAround(phrase, t);
}

/** « mercredi 11 mars » -> « Mercredi 11 mars » (et pas « Mercredi 11 Mars »). */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Review() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [highlight, setHighlight] = useState("");
  const [mood, setMood] = useState("");
  const [transcription, setTranscription] = useState("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Deux natures d'échec, deux dessins. « save » : le serveur a refusé ou n'a
     pas répondu — c'est rouge, et rien n'est perdu. « stopped » : NOUS avons
     arrêté d'attendre, donc l'état de la journée est INCONNU — c'est ambre, la
     teinte que ce produit réserve à « à vérifier », et le texte le dit. */
  const [errorKind, setErrorKind] = useState<"save" | "stopped">("save");
  /** Secondes écoulées depuis le tap de publication. Cf. `PublishProgress`. */
  const [publishSeconds, setPublishSeconds] = useState(0);
  /** Le rôle par enfant (`/api/children`) : `null` = pas encore connu. */
  const [roles, setRoles] = useState<Map<string, MemberRole> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveAttachment, setConfirmRemoveAttachment] = useState<
    string | null
  >(null);
  const [removingAttachment, setRemovingAttachment] = useState<string | null>(
    null,
  );
  const [batchDays, setBatchDays] = useState<BatchEntrySummary[] | null>(null);
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  /** La source est repliée sur mobile (l'écran appartient à la correction) et
      dépliée dès `md` où elle tient dans sa propre colonne. */
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<"pages" | "texte">("pages");
  /** Quarts de tour appliqués à chaque page, à l'affichage seulement : cf.
      `SourcePage`. Par pièce jointe, et remis à zéro d'une journée à l'autre. */
  const [rotations, setRotations] = useState<Record<string, number>>({});
  /** Le dépli de correction est piloté par l'état : `group-open:` ne génère
      aucune règle dans ce Tailwind, le chevron ne tournait jamais. */
  const [itemsOpen, setItemsOpen] = useState(false);
  /** Incertitude dépliée. `null` = « la première non tranchée », ce qui fait
      que la suivante s'ouvre d'elle-même dès qu'on a tranché celle-ci. */
  const [openUncertainty, setOpenUncertainty] = useState<number | null>(null);
  /** Dernière incertitude tranchée : on s'assure que la confirmation verte est
      RÉELLEMENT visible (elle atterrissait derrière la barre d'action). */
  const [justResolved, setJustResolved] = useState<number | null>(null);
  /** Champ à faire remonter et à donner au clavier (revenir sur un choix). */
  const [focusField, setFocusField] = useState<UncertaintyField | null>(null);
  /** Relance de lecture en cours : le bouton porte l'attente, pas une roue. */
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** Le PATCH de publication en cours, pour pouvoir cesser de l'attendre. */
  const publishAbort = useRef<AbortController | null>(null);
  /** La lecture à trancher n'a pris le focus qu'une fois par journée ouverte. */
  const focusedReading = useRef<string | null>(null);
  /** Notre propre navigation (publier, supprimer) : le garde-fou se tait. */
  const leaving = useRef(false);
  /** Empreinte de la journée TELLE QU'ELLE EST SUR LE SERVEUR. Voir `dirty`. */
  const clean = useRef("");

  const hydrate = useCallback((e: Entry) => {
    setEntry(e);
    setItems(toDraftItems(e.items));
    setTitle(e.title ?? "");
    setStory(e.story ?? "");
    setHighlight(e.highlight ?? "");
    setMood(e.mood ?? "");
    setTranscription(e.transcription ?? "");
    setSource(e.source);
    setDate(e.date);
    // L'empreinte est calculée avec EXACTEMENT les mêmes normalisations que le
    // correctif envoyé (`currentPatch`) : sans ça, un champ vide côté serveur
    // (`null`) et le même champ vide côté formulaire (`""`) feraient croire à
    // une modification dès l'ouverture de l'écran, et le garde-fou se
    // déclencherait sans qu'on ait touché à rien.
    clean.current = fingerprint({
      title: e.title,
      story: e.story,
      highlight: e.highlight,
      mood: e.mood,
      transcription: e.transcription,
      source: e.source,
      date: e.date,
      items: toDraftItems(e.items),
    });
  }, []);

  const fetchEntry = useCallback(async () => {
    const e = await api.getEntry(id);
    setLoadError(null);
    hydrate(e);
    if (e.status === "processing") {
      pollRef.current = setTimeout(fetchEntry, 2500);
    }
  }, [id, hydrate]);

  const [reloadKey, setReloadKey] = useState(0);

  /* Les rotations sont attachées à la journée qu'on relit, pas au composant :
     d'une journée d'un lot à la suivante, la route est la même et l'état
     survivait — la page 1 de la journée suivante arrivait tournée du quart de
     tour donné à la précédente. */
  useEffect(() => setRotations({}), [id]);

  useEffect(() => {
    // L'échec de CHARGEMENT est un état à part entière : avant, il était rangé
    // dans `error` alors que le rendu, lui, restait bloqué sur « Chargement… »
    // parce que `entry` valait toujours null. L'écran mentait indéfiniment.
    fetchEntry().catch((err) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchEntry, reloadKey]);

  /* ── QUI A LE DROIT D'ÊTRE ICI ────────────────────────────────────────────
     `/api/entries/:id` renvoie la journée à TOUS les membres du carnet, lecteurs
     compris (le serveur ne leur cache que les brouillons). Cet écran est un
     ÉDITEUR : ouvert à un lecteur, il lui laissait choisir une suggestion, voir
     le texte changer, taper « Republier la journée » — et lui répondait « accès
     refusé » sur un travail qui ne pourra jamais être enregistré. Le rôle vient
     donc de `/api/children`, et un lecteur reçoit la journée en LECTURE (cf.
     `ReadOnlyDay`) au lieu d'un formulaire piégé.
     Échec de la liste → `null` : on n'invente pas un refus à partir d'une
     requête qui n'a pas répondu, le serveur reste l'arbitre à l'enregistrement. */
  useEffect(() => {
    let alive = true;
    api.listChildren().then(
      (list) => {
        if (alive) setRoles(roleMap(list));
      },
      () => {
        if (alive) setRoles(null);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  /* Le compteur de la publication. Une seconde de granularité : c'est la seule
     information DÉTERMINÉE qu'on possède sur une requête dont le serveur ne
     rapporte pas l'avancement, et elle suffit à transformer « ça tourne » en
     « ça fait 12 secondes ». Il ne tourne QUE pendant la publication. */
  useEffect(() => {
    if (saving !== "publish") {
      setPublishSeconds(0);
      return;
    }
    // `performance.now()` et non `Date.now()` : une horloge MONOTONE, insensible
    // à un changement d'heure système pendant l'attente (et non figeable par un
    // harnais de mesure, ce qui rend le chiffre vérifiable de l'extérieur).
    const start = performance.now();
    const t = setInterval(
      () => setPublishSeconds(Math.round((performance.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [saving]);

  // Le carnet photographié peut couvrir plusieurs journées d'un coup : quand
  // c'est le cas, on récupère les journées sœurs du lot pour le stepper.
  useEffect(() => {
    if (!entry?.batchId) {
      setBatchDays(null);
      return;
    }
    let alive = true;
    api
      .getEntryBatch(entry.batchId)
      .then((r) => {
        if (alive) setBatchDays(r.entries);
      })
      .catch(() => {
        if (alive) setBatchDays(null);
      });
    return () => {
      alive = false;
    };
    // Inclut `id` : deux journées voisines d'un même lot ont souvent le même
    // batchId ET le même statut (« draft »), ce qui laisserait cet effet ne
    // jamais se redéclencher en navigation SPA d'une journée à l'autre sans
    // ce repère — et donc le stepper afficher un compte de publication figé.
  }, [entry?.batchId, entry?.status, id]);

  const uncertainties = useMemo(
    () => normalizeUncertainties(entry?.uncertainties),
    [entry?.uncertainties],
  );
  const pending = uncertainties.filter((u) => !u.resolved).length;

  /** Les mots encore douteux, en motifs : une ligne de la journée qui en
      contient un porte « à vérifier », les autres « confirmé ». La casse est
      ignorée — le carnet écrit « Gratin de courgettes », la machine a signalé
      « gratin de courgettes » — et le mot doit être trouvé EN TANT QUE MOT
      (cf. `wordMatcher`). */
  const flaggedValues = useMemo(
    () =>
      uncertainties
        .filter((u) => !u.resolved)
        .map((u) => wordMatcher(u.original))
        .filter((re): re is RegExp => re !== null),
    [uncertainties],
  );

  /** Où le mot douteux a été lu, dans l'ordre de ce qui aide à le RETROUVER
      SUR LA PHOTO : la transcription d'abord (c'est le carnet mot pour mot),
      puis le champ que le modèle désigne, puis le reste. Le champ désigné passe
      en second à dessein — « dans le récit » situe le mot dans une reformulation
      de la machine, la transcription le situe sur le papier. */
  const phraseFor = useCallback(
    (u: Uncertainty): string | null => {
      const named =
        u.champ === "titre"
          ? title
          : u.champ === "recit"
            ? story
            : u.champ === "temps_fort"
              ? highlight
              : "";
      for (const text of [transcription, named, story, highlight, title]) {
        const phrase = text ? phraseAround(text, u.original) : null;
        if (phrase) return phrase;
      }
      return null;
    },
    [transcription, story, highlight, title],
  );

  /** L'incertitude dépliée : celle qu'on a choisie si elle est encore à
      trancher, sinon la première qui reste. */
  const openIndex = useMemo(() => {
    const left = uncertainties
      .map((u, i) => ({ u, i }))
      .filter((x) => !x.u.resolved)
      .map((x) => x.i);
    return openUncertainty !== null && left.includes(openUncertainty)
      ? openUncertainty
      : (left[0] ?? null);
  }, [uncertainties, openUncertainty]);

  /* ── CE QUI DEMANDE UN HUMAIN PREND LE FOCUS ──────────────────────────────
     Mesuré à l'arrivée sur cet écran : `document.activeElement === <body>`. La
     carte à trancher était pourtant déjà dépliée, en haut, ambre — mais un
     clavier arrivait sur RIEN, et un lecteur d'écran annonçait le titre de la
     page puis se taisait. Le focus va donc sur la lecture à trancher, une seule
     fois par journée ouverte (`focusedReading` porte l'id de la journée, pour
     que la journée suivante d'un lot le reçoive à son tour), et jamais si le
     travail est déjà commencé : voler le focus à quelqu'un qui écrit est pire
     que de ne pas le donner. */
  useEffect(() => {
    if (!entry || entry.status === "processing") return;
    if (focusedReading.current === entry.id) return;
    if (openIndex === null) {
      // Rien à trancher : personne n'est appelé, on ne déplace rien.
      focusedReading.current = entry.id;
      return;
    }
    const el = document.getElementById(`rv-u-${openIndex}`);
    if (!el) return;
    const active = document.activeElement;
    if (active && active !== document.body && el.contains(active) === false) {
      // Quelqu'un a déjà la main quelque part : on ne la lui prend pas.
      focusedReading.current = entry.id;
      return;
    }
    focusedReading.current = entry.id;
    el.focus();
  }, [entry, openIndex]);

  function setItemField(idx: number, key: string, value: string) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, data: { ...it.data, [key]: value } } : it,
      ),
    );
  }

  function addItem(type: ItemType) {
    setItems((prev) => [
      ...prev,
      { type, data: { ...EMPTY[type] }, position: prev.length },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function cleanedItems() {
    return items
      .map((it, position) => ({ type: it.type, data: pruneEmpty(it.data), position }))
      .filter((it) => Object.keys(it.data).length > 0);
  }

  function currentPatch() {
    return {
      title: title.trim() || null,
      story: story.trim() || null,
      highlight: highlight.trim() || null,
      mood: mood || null,
      transcription: transcription || null,
      source,
      date,
      items: cleanedItems(),
    };
  }

  /** Rend `true` si le serveur a bien pris l'enregistrement. Ce booléen n'est
   *  pas décoratif : le garde-fou de sortie s'en sert pour ne PAS quitter quand
   *  l'enregistrement a échoué — sinon « Enregistrer, puis quitter » perdrait le
   *  travail exactement dans le cas qu'il est censé protéger. */
  const save = useCallback(
    async (publish: boolean): Promise<boolean> => {
      setSaving(publish ? "publish" : "draft");
      setError(null);
      const ctrl = publish ? new AbortController() : null;
      if (ctrl) publishAbort.current = ctrl;
      try {
        await api.updateEntry(
          id,
          { ...currentPatch(), publish },
          ctrl?.signal,
        );
        if (publish) {
          // On sort de l'écran : le garde-fou « travail non enregistré » ne doit
          // pas se déclencher sur notre propre navigation.
          leaving.current = true;
          // Journée publiée dans un lot multi-jours : enchaîne directement sur
          // la prochaine journée du carnet à valider plutôt que de revenir au
          // journal, pour valider le lot journée par journée.
          const batchId = entry?.batchId;
          const next = batchId
            ? await api
                .getEntryBatch(batchId)
                .then((r) => r.entries.find((d) => d.status !== "published"))
                .catch(() => undefined)
            : undefined;
          /* `replace` : sans lui, le bouton RETOUR du téléphone reposait le
             parent dans l'ÉDITEUR de la journée qu'il venait de publier —
             titrée « Relire la journée », badgée « publiée » et « à vérifier ».
             Rien de destructeur, mais on croit avoir défait ce qu'on vient de
             faire. La journée publiée se relit désormais par le journal, comme
             tout le reste. */
          if (next) nav(`/entries/${next.id}`, { replace: true });
          else
            /* LE REÇU. `nav("/")` renvoyait au journal sans un mot : rien ne
               disait que la journée était partie, ni que les proches étaient
               prévenus. On emporte donc de quoi l'écrire là-bas — le titre tel
               qu'on vient de le relire, et si c'est une PREMIÈRE publication ou
               une correction remise en ligne (le mot change : « publiée » /
               « republiée »). Cf. `Timeline.tsx`, composant `Receipt`. */
            nav("/", {
              replace: true,
              state: {
                published: {
                  entryId: id,
                  title: title.trim() || entry?.title || null,
                  childName: entry?.child?.name ?? null,
                  again: entry?.status === "published",
                },
              },
            });
        } else {
          const e = await api.getEntry(id);
          hydrate(e);
        }
        return true;
      } catch (err) {
        /* L'ABANDON DEMANDÉ dit la vérité, et toute la vérité : on a cessé
           d'attendre, mais le serveur a peut-être appliqué la publication. Le
           mensonge confortable (« publication annulée ») ferait croire que la
           journée n'est pas partie alors qu'elle peut l'être. */
        const stopped = err instanceof DOMException && err.name === "AbortError";
        setErrorKind(stopped ? "stopped" : "save");
        setError(
          stopped
            ? "Le carnet n’avait pas encore répondu : la publication n’est donc pas confirmée — elle a peut-être abouti malgré tout. Vos corrections sont toujours à l’écran. Ouvrez le journal pour voir l’état de la journée, ou publiez à nouveau : une journée déjà publiée le reste, sans doublon."
            : err instanceof Error
              ? err.message
              : "Échec de l'enregistrement",
        );
        return false;
      } finally {
        publishAbort.current = null;
        setSaving(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, entry?.batchId, nav, hydrate, items, title, story, highlight, mood, transcription, source, date],
  );

  /* ── LE TRAVAIL NE SE PERD PLUS ───────────────────────────────────────────
     Cet écran est le seul du produit où l'on ÉCRIT. Un récit repris à la main,
     un temps fort reformulé, trois moments corrigés : tout cela vivait dans
     l'état React et dans rien d'autre. Un rechargement, un retour au journal,
     un tap sur le nom de l'instance en haut, et c'était perdu sans un mot —
     alors que la journée, elle, reste un brouillon côté serveur.

     Deux garde-fous, et seulement quand il y a VRAIMENT quelque chose à perdre
     (`dirty` compare des empreintes normalisées, cf. `fingerprint`) : une
     confirmation qui se déclenche à vide est une confirmation qu'on apprend à
     ignorer. Aucun des deux ne se déclenche sur nos propres sorties (publier,
     supprimer, passer à la journée suivante du lot). */
  const dirty = useMemo(
    () =>
      entry && (entry.status === "draft" || entry.status === "published")
        ? JSON.stringify(currentPatch()) !== clean.current
        : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, title, story, highlight, mood, transcription, source, date, items],
  );

  // 1. Rechargement, fermeture de l'onglet : la boîte native du navigateur est
  //    ici la SEULE chose qui puisse s'interposer.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 2. Navigation interne (le journal, les réglages, le menu) : notre propre
  //    dialogue, en français, avec la sortie qui manquait — « enregistrer PUIS
  //    quitter ». Un garde-fou qui ne propose que « perdre » ou « rester » est
  //    un garde-fou qui fait perdre du travail une fois sur deux.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leaving.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  /* Peut-on écrire dans CETTE journée ? Rôle encore inconnu → oui : on ne
     bloque pas le geste du soir sur une requête secondaire, et le serveur reste
     l'arbitre (son refus est dessiné). */
  const canEditEntry =
    !entry || roles === null ? true : canWrite(roles.get(entry.childId));

  // Le chemin clavier existe et il est MONTRÉ (barre d'indices sous les
  // actions) : ⌘/Ctrl + ⏎ publie sans viser un bouton. Il suit la même règle que
  // le bouton : pas de raccourci vers une publication qu'on n'a pas le droit de
  // faire — sinon un lecteur déclenche un 403 invisible depuis un écran qui ne
  // montre aucun bouton de publication.
  useEffect(() => {
    if (!canEditEntry) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void save(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, canEditEntry]);

  // Persiste d'abord le brouillon en cours (les champs de valorisation ont pu
  // être retouchés à la main sans être encore enregistrés), puis applique la
  // correction choisie : elle remplace le mot incertain dans les champs
  // enregistrés et alimente le glossaire de l'enfant pour les prochaines
  // lectures (voir corrections.ts côté serveur).
  async function resolveUncertainty(index: number, value: string) {
    setResolvingIndex(index);
    setError(null);
    try {
      await api.updateEntry(id, currentPatch());
      const e = await api.resolveUncertainty(id, index, value);
      hydrate(e);
      // On rend la main au calcul « la première non tranchée » : la lecture
      // suivante s'ouvre toute seule, sans un tap de plus.
      setOpenUncertainty(null);
      setJustResolved(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la validation");
    } finally {
      setResolvingIndex(null);
    }
  }

  /* APRÈS UN CHOIX, ON MONTRE CE QUI RESTE À FAIRE — et s'il ne reste rien, on
     montre la confirmation.
     Avant, la confirmation verte de son propre geste atterrissait 44 px
     DERRIÈRE la barre d'action : on ne la voyait jamais. La corriger en
     défilant systématiquement dessus serait aussi faux : ce qui compte après
     avoir tranché une lecture, c'est la suivante. Donc : cible = la prochaine
     lecture à trancher si elle existe, sinon le reçu vert ; et on ne défile que
     si la cible n'est pas déjà dans la bande lisible (sous l'en-tête, au-dessus
     de la barre) — jamais en douceur si l'on a demandé moins de mouvement. */
  useEffect(() => {
    if (justResolved === null) return;
    const el = document.getElementById(
      `rv-u-${openIndex !== null ? openIndex : justResolved}`,
    );
    setJustResolved(null);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = 64; // l'en-tête de l'application
    const bottom = window.innerHeight - (barRef.current?.offsetHeight ?? 104) - 8;
    if (r.top >= top && r.bottom <= bottom) return;
    el.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [justResolved, uncertainties, openIndex]);

  /* « Revenir sur ce choix » : le serveur refuse de re-trancher une lecture
     (409), et c'est juste — mais le mot, lui, reste modifiable à la main. On
     emmène donc l'utilisateur sur le champ où la substitution a eu lieu, on
     l'ouvre si besoin (la transcription vit derrière un onglet, replié sur
     mobile) et on lui donne le clavier. C'est l'annulation qui manquait. */
  useEffect(() => {
    if (!focusField) return;
    const target =
      focusField === "titre"
        ? "rv-title"
        : focusField === "temps_fort"
          ? "rv-highlight"
          : focusField === "transcription_integrale"
            ? "rv-transcription"
            : "rv-story";
    if (
      focusField === "transcription_integrale" &&
      (!sourceOpen || sourceTab !== "texte")
    ) {
      // Deux passes : on ouvre d'abord le panneau, l'effet se rejoue quand la
      // zone de texte est montée (sinon on cherchait un élément inexistant).
      setSourceOpen(true);
      setSourceTab("texte");
      return;
    }
    const el = document.getElementById(target);
    setFocusField(null);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    (el as HTMLTextAreaElement).focus({ preventScroll: true });
  }, [focusField, sourceOpen, sourceTab]);

  async function remove() {
    await api.deleteEntry(id);
    leaving.current = true;
    nav("/");
  }

  /* Relancer la lecture sur les pages DÉJÀ téléversées.
     « Reprendre la photo » était la seule sortie d'un échec : c'est la bonne
     quand la page est floue, c'est la mauvaise quand la lecture est morte avec
     le serveur (un redémarrage). Dans ce cas les pages sont intactes et le
     carnet papier est reparti chez la nounou — on ne peut PAS rephotographier.
     Après la relance, la journée repasse en `processing` : `reloadKey` relance
     `fetchEntry`, qui se remet à sonder tout seul jusqu'au brouillon. */
  async function retryRead() {
    setRetrying(true);
    setError(null);
    try {
      await api.retryEntryRead(id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Échec de la relance de la lecture",
      );
    } finally {
      setRetrying(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    setRemovingAttachment(attachmentId);
    setError(null);
    try {
      await api.deleteAttachment(attachmentId);
      setEntry((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments.filter((a) => a.id !== attachmentId),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec du retrait de la page",
      );
    } finally {
      setRemovingAttachment(null);
      setConfirmRemoveAttachment(null);
    }
  }

  if (loadError && !entry) {
    return (
      <LoadFailed
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  if (!entry) return <ReviewSkeleton />;

  if (entry.status === "processing") {
    return <ProcessingView attachments={entry.attachments} />;
  }

  if (entry.status === "failed") {
    return (
      <ReadFailed
        when={`${capitalize(longDate(entry.date))} · ${SOURCE_LABELS[entry.source]}`}
        reason={entry.failureReason}
        canRetry={entry.attachments.length > 0 && canEditEntry}
        retrying={retrying}
        error={error}
        onRetry={retryRead}
        onDelete={() => setConfirmDelete(true)}
        confirmOpen={confirmDelete}
        onConfirmOpenChange={setConfirmDelete}
        onConfirmDelete={remove}
      />
    );
  }

  /* Un LECTEUR reçoit la journée, pas le formulaire. Tant que le rôle n'est pas
     connu (`roles === null`), on ne refuse pas — mais on ne publie pas non plus
     à l'aveugle : le serveur reste l'arbitre, et l'erreur qu'il renvoie est
     dessinée. */
  if (!canEditEntry) {
    return <ReadOnlyDay entry={entry} />;
  }

  const attachmentToRemove = entry.attachments.find(
    (a) => a.id === confirmRemoveAttachment,
  );
  const words = transcription.trim()
    ? transcription.trim().split(/\s+/).length
    : 0;
  const published = entry.status === "published";
  const hasStepper = !!batchDays && batchDays.length > 1;

  /* ── LES QUATRE TEMPS, JUSQU'AU BOUT ──────────────────────────────────────
     Le rail « photo → lecture → relecture → partage » n'était monté que sur
     l'écran de capture, c'est-à-dire au PAS 1 — et il disparaissait aux pas 2 et
     3, exactement là où la question « est-ce que j'y suis presque ? » se pose.
     Il est ici aussi (et sur l'attente de lecture, et sur le squelette, et sur
     l'échec de lecture) : la photo est prise, la lecture est faite, la relecture
     est le temps courant. Sur une journée DÉJÀ publiée qu'on revient corriger,
     le partage est franchi lui aussi — le rail dit la vérité de la journée, pas
     une chorégraphie figée. */
  const steps: Step[] = [
    { key: "photo", label: "Photo", state: "done" },
    { key: "read", label: "Lecture", state: "done" },
    { key: "review", label: "Relecture", state: published ? "done" : "current" },
    {
      key: "share",
      label: "Partage",
      state: published ? "done" : "todo",
    },
  ];

  return (
    /* max-w-5xl et non 3xl : à 1 280 px, la colonne du récit plafonnait à
       339 px, soit 41 caractères par ligne — sous la bande de lecture de
       45–75 ch. La même page à 1 024 px donne 507 px de colonne, ~58 ch. */
    <div className="mx-auto w-full max-w-5xl p-4 pb-32">
      {/* Le rail des quatre temps, au même endroit et au même cran que sur la
          capture : c'est la seule chose de l'écran qui ne change pas d'un pas à
          l'autre, et c'est précisément son travail.

          UN SEUL OBJET DE PROGRESSION PAR ÉCRAN. Sur un carnet photographié sur
          plusieurs jours, le stepper de lot (« Journée 3 sur 3 · 2/3 publiées »)
          dit la même chose EN PLUS PRÉCIS, avec la même grammaire visuelle
          (ronds, filet, coches). Les empiler mesurait 146 px de chrome avant le
          titre et poussait la première lecture à trancher SOUS la barre d'action
          (bas de carte à 731 px pour une barre à 717) — exactement la faute que
          cet écran a corrigée au tour précédent. Avec un lot, le rail cède la
          place ; sans lot, il est là.

          LE RAIL PREND TOUTE LA COLONNE (`w-full`, plus de `max-w-sm`). Bridé à
          384 px dans une colonne de 992 px, il se tassait dans le coin haut
          gauche : quatre ronds serrés sur le premier tiers, puis 600 px de vide
          jusqu'au compteur « 5 à vérifier » — le regard lisait un fragment,
          pas un parcours. Étendu, chaque temps tombe au quart de la colonne et
          les filets deviennent lisibles comme un chemin. C'est la même largeur
          que sur la capture, où le rail a toujours suivi la colonne. */}
      {!hasStepper && <CaptureSteps steps={steps} className="mb-4 w-full" />}

      {hasStepper && (
        <div className="mb-4">
          <DayStepper
            days={batchDays}
            currentId={id}
            onSelect={(nextId) => nav(`/entries/${nextId}`)}
          />
        </div>
      )}

      {/* ── L'en-tête : de qui, quand, et ce qui reste à faire ───────────────
          Titre et pastille sur UNE ligne, une seule ligne de méta en dessous :
          le prénom passe dans la méta pour que le titre reste court et laisse
          la place à la pastille — 32 px gagnés, et c'est exactement ce qu'il
          fallait pour que la première lecture à vérifier soit au-dessus de la
          ligne de flottaison. */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-title font-semibold">
            Relire la journée
          </h1>
          {/* La date en clair est ICI, et nulle part ailleurs : le lot ne
              l'écrit plus (il ne garde que « mer 11 mars » sous la puce
              courante, qui est un repère de file, pas une date de journée).
              Chaque segment emporte SON séparateur et ne se casse pas : à
              320 px, la ligne repartait sur « · Nounou », un point médian
              orphelin en tête de ligne. */}
          <p className="text-meta text-muted-foreground">
            {[
              entry.child?.name,
              capitalize(longDate(entry.date)),
              SOURCE_LABELS[entry.source],
            ]
              .filter(Boolean)
              .map((part, i, all) => (
                <span key={i}>
                  <span className="whitespace-nowrap">
                    {part}
                    {i < all.length - 1 ? " ·" : ""}
                  </span>
                  {i < all.length - 1 ? " " : ""}
                </span>
              ))}
          </p>
        </div>
        {/* mt-0.5 (2 px) : nudge optique, la pastille de 24 px se centre sur la
            première ligne de 28 px du titre. */}
        {pending > 0 ? (
          <Badge variant="warning" className="mt-0.5">
            <TriangleAlert aria-hidden="true" />
            {pending} à vérifier
          </Badge>
        ) : (
          <Badge variant="success" className="mt-0.5">
            <Check aria-hidden="true" />
            {published ? "Publiée" : "Tout est confirmé"}
          </Badge>
        )}
      </header>

      {/* 1fr / 1.4fr et non 1/1.1 : la colonne du récit doit rester dans la
          bande de lecture de 45–75 caractères. Mesuré (17 px Nunito, chasse
          moyenne 8,32 px) : 46 ch à 768, 57 ch à 1 280. À 390 px, 45 ch
          exigerait 374 px de texte pour 358 px d'écran — la bande est
          physiquement hors d'atteinte au pouce sans descendre le récit sous
          17 px, et le récit est ce qui sera publié : il se relit à la taille
          où il se lira. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-6">
        {/* ── La source : la page photographiée et le mot à mot ───────────── */}
        <section
          aria-label="La source"
          className="flex flex-col gap-3 md:sticky md:top-4 md:self-start"
        >
          {/* Sur mobile, la source est UNE LIGNE de 50 px qui montre déjà les
              pages en vignettes : on la déplie quand on veut confronter. Elle
              tenait sur deux lignes (66 px) pour dire la même chose — et sur cet
              écran, 16 px valent un quart de ligne de journée. */}
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            aria-expanded={sourceOpen}
            aria-controls="rv-source"
            className="tap flex w-full items-center gap-3 rounded-2xl border bg-card p-2 text-left shadow-card transition-colors dur-fast ease-carnet hover:bg-accent md:hidden"
          >
            <span className="flex shrink-0 -space-x-2" aria-hidden="true">
              {entry.attachments.slice(0, 3).map((a) => (
                <img
                  key={a.id}
                  src={a.thumbUrl}
                  alt=""
                  className="seam size-8 rounded-md bg-muted object-cover object-top"
                />
              ))}
              {entry.attachments.length === 0 && (
                <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Images className="size-4" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ui font-bold">Ce qui est écrit</span>
              <span className="text-meta text-muted-foreground">
                {" · "}
                {entry.attachments.length === 1
                  ? "1 page"
                  : `${entry.attachments.length} pages`}
                {" · "}
                {words} mots lus
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
                sourceOpen && "rotate-180",
              )}
            />
          </button>

          <div
            id="rv-source"
            className={cn("flex-col gap-3", sourceOpen ? "flex" : "hidden md:flex")}
          >
            {/* Sur grand écran, la ligne dépliante n'existe pas : ce qui a été
                trouvé doit être dit ici. */}
            <p className="hidden items-baseline justify-between gap-3 md:flex">
              <span className="surtitre text-muted-foreground">
                Ce qui est écrit
              </span>
              <span className="text-meta text-muted-foreground">
                {entry.attachments.length === 1
                  ? "1 page"
                  : `${entry.attachments.length} pages`}
                {" · "}
                {words} mots lus
              </span>
            </p>

            {/* Deux onglets : le papier, puis ce que la machine y a lu.
                Vrai motif ARIA : `tabindex` roulant + flèches gauche/droite,
                pas juste les rôles posés dessus. */}
            <div
              role="tablist"
              aria-label="Ce qui est écrit"
              className="flex gap-1 rounded-xl bg-muted p-1"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = sourceTab === "pages" ? "texte" : "pages";
                setSourceTab(next);
                document.getElementById(`rv-tab-${next}`)?.focus();
              }}
            >
              <SourceTab
                id="rv-tab-pages"
                panel="rv-panel-pages"
                selected={sourceTab === "pages"}
                onSelect={() => setSourceTab("pages")}
                Icon={Images}
              >
                La page
              </SourceTab>
              <SourceTab
                id="rv-tab-texte"
                panel="rv-panel-texte"
                selected={sourceTab === "texte"}
                onSelect={() => setSourceTab("texte")}
                Icon={FileText}
              >
                Mot à mot
              </SourceTab>
            </div>

            {sourceTab === "pages" ? (
              <div
                role="tabpanel"
                id="rv-panel-pages"
                aria-labelledby="rv-tab-pages"
                className="flex flex-col gap-3"
              >
                {entry.attachments.map((a, i) => (
                  <SourcePage
                    key={a.id}
                    attachment={a}
                    index={i}
                    total={entry.attachments.length}
                    quarter={rotations[a.id] ?? 0}
                    onRotate={() =>
                      setRotations((prev) => ({
                        ...prev,
                        [a.id]: ((prev[a.id] ?? 0) + 1) % 4,
                      }))
                    }
                    removing={removingAttachment === a.id}
                    onRemove={
                      published ? null : () => setConfirmRemoveAttachment(a.id)
                    }
                  />
                ))}
                {entry.attachments.length === 0 && (
                  <p className="rounded-xl bg-muted px-4 py-3 text-meta text-muted-foreground">
                    Aucune page n'est attachée à cette journée : le récit a été
                    saisi à la main.
                  </p>
                )}
              </div>
            ) : (
              <div
                role="tabpanel"
                id="rv-panel-texte"
                aria-labelledby="rv-tab-texte"
                className="flex flex-col gap-2"
              >
                <p className="text-meta text-muted-foreground">
                  Ce que Racontine a lu sur le papier, mot à mot. Corrigez ici
                  pour garder la trace exacte du carnet.
                </p>
                <GrowingTextarea
                  id="rv-transcription"
                  aria-label="Transcription intégrale"
                  minLines={8}
                  value={transcription}
                  placeholder="La transcription du carnet…"
                  className="paper-ruled paper-ruled--plain"
                  onChange={(e) => setTranscription(e.target.value)}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── La journée : ce qui sera publié ─────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Les lectures incertaines : le seul travail que la machine ne peut
              pas finir, donc la première chose sous l'en-tête. */}
          {pending > 0 && (
            <section aria-labelledby="verif" className="flex flex-col gap-2">
              {/* Un seul compteur sur l'écran : la pastille de l'en-tête. Le
                  surtitre nomme la section, il ne la chiffre pas une deuxième
                  fois (à 320 px, les deux se cassaient chacun sur deux lignes). */}
              <h2 id="verif" className="surtitre text-muted-foreground">
                Ce que Racontine a lu
              </h2>
              {/* Seules les lectures À TRANCHER sont ici — les tranchées sont
                  passées sous la journée, avec les états qu'elles expliquent.
                  L'INDEX D'ORIGINE est conservé : c'est lui que le serveur
                  attend pour résoudre la bonne incertitude. */}
              {uncertainties
                .map((u, i) => ({ u, i }))
                .filter(({ u }) => !u.resolved)
                .map(({ u, i }) =>
                  i === openIndex ? (
                    <UncertaintyCard
                      key={`${u.original}-${i}`}
                      id={`rv-u-${i}`}
                      item={u}
                      phrase={phraseFor(u)}
                      /* Pendant une publication, trancher une lecture partirait
                         en même temps que le PATCH de la journée : deux écritures
                         sur la même journée, et un résultat qui dépend de l'ordre
                         d'arrivée. La carte attend son tour. */
                      disabled={resolvingIndex !== null || saving !== null}
                      resolving={resolvingIndex === i}
                      onResolve={(value) => resolveUncertainty(i, value)}
                    />
                  ) : (
                    <CollapsedReading
                      key={`${u.original}-${i}`}
                      id={`rv-u-${i}`}
                      item={u}
                      onOpen={() => setOpenUncertainty(i)}
                    />
                  ),
                )}
            </section>
          )}

          {/* ── LA JOURNÉE EN UN COUP D'ŒIL ───────────────────────────────────
              Ce qui part chez les proches, en clair, avant le bouton. Ni
              formulaire ni carte : cinq lignes de 56 px, un filet entre elles.
              L'état à droite est la SEULE couleur (confiance), et il garde son
              glyphe pour rester lisible en noir et blanc. La tuile d'icône est
              grise à dessein : les feutres de catégorie appartiennent au
              journal, pas à cet écran (lib/ui.ts). */}
          <MomentsGlance items={items} flagged={flaggedValues} />

          {/* Les lectures déjà tranchées, juste sous la journée : elles
              EXPLIQUENT les pastilles « confirmé » de la liste au-dessus (quel
              mot a été lu, quel mot sera publié). Elles ne demandent plus rien
              à personne, donc elles ne sont plus au-dessus de la ligne de
              flottaison — mais chaque ligne reste une sortie vers le champ
              corrigé, parce qu'un choix validé doit pouvoir être repris. */}
          {uncertainties.some((u) => u.resolved) && (
            /* `aria-label` et non un titre `sr-only` : la classe `sr-only`
               s'implémente avec des marges de -1 px, donc un titre invisible
               ajoutait quatre valeurs hors grille et un nœud « rogné » au
               relevé — pour un intitulé que personne ne voit. */
            <section aria-label="Lectures validées" className="flex flex-col gap-2">
              {uncertainties
                .map((u, i) => ({ u, i }))
                .filter(({ u }) => !!u.resolved)
                .map(({ u, i }) => (
                  <ResolvedReading
                    key={`${u.original}-${i}`}
                    id={`rv-u-${i}`}
                    item={u}
                    onEdit={() => setFocusField(u.champ ?? "recit")}
                  />
                ))}
            </section>
          )}

          {/* Le dépli ne sert plus qu'à CORRIGER : la lecture, elle, est
              au-dessus et n'a plus besoin d'un geste. */}
          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            className="rounded-2xl border bg-card shadow-card"
          >
            <summary className="tap flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-ui font-bold">
                  Corriger les moments
                </span>
                <span className="block text-meta text-muted-foreground">
                  {items.length === 0
                    ? "Ajouter un repas, une sieste, une activité…"
                    : "Modifier, retirer ou ajouter un moment"}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
                  itemsOpen && "rotate-180",
                )}
              />
            </summary>
            <div className="border-t px-4 py-4">
              <ItemEditor
                items={items}
                onField={setItemField}
                onRemove={removeItem}
                onAdd={addItem}
              />
            </div>
          </details>

          {/* Titre — une zone de texte et non un champ d'une ligne : un titre
              de journée dépasse 40 caractères et se lisait coupé en plein mot. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-title">Titre de la journée</Label>
            <GrowingTextarea
              id="rv-title"
              minLines={1}
              value={title}
              placeholder="Une jolie journée…"
              className="font-serif text-title font-semibold"
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey)
                  e.preventDefault();
              }}
            />
          </div>

          {/* Récit — le cœur, écrit sur les lignes du cahier. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-story">Le récit de la journée</Label>
            <GrowingTextarea
              id="rv-story"
              minLines={5}
              value={story}
              placeholder="Le récit chaleureux que liront les proches…"
              className="paper-ruled paper-ruled--plain"
              onChange={(e) => setStory(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-highlight">
              {/* gap-2 (8 px) : écart icône <-> libellé porté par `Label`. */}
              <Star className="size-4 text-muted-foreground" aria-hidden="true" />
              Temps fort du jour
            </Label>
            {/* Une phrase entière : un champ d'une ligne la coupait en plein
                mot (« … du couloir jusqu'à la »). */}
            <GrowingTextarea
              id="rv-highlight"
              minLines={1}
              value={highlight}
              placeholder="Le moment à retenir…"
              onChange={(e) => setHighlight(e.target.value)}
            />
          </div>

          {/* Contexte compact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rv-date">Date</Label>
              <Input
                id="rv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rv-source">Lieu</Label>
              <Select
                id="rv-source"
                className="w-full"
                value={source}
                onChange={(e) => setSource(e.target.value as EntrySource)}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-mood">Humeur</Label>
            <Input
              id="rv-mood"
              value={mood}
              placeholder="Joyeuse, un peu fatiguée…"
              onChange={(e) => setMood(e.target.value)}
            />
          </div>

          {error && (
            <div
              role="alert"
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3",
                errorKind === "stopped"
                  ? "border-warning bg-warning-bg"
                  : "border-destructive bg-destructive-soft",
              )}
            >
              {/* mt-0.5 (2 px) : nudge optique, l'icône de 16 px se centre sur
                  la ligne de 20 px du libellé. */}
              <TriangleAlert
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  errorKind === "stopped" ? "text-warning" : "text-destructive",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-ui font-bold">
                  {errorKind === "stopped"
                    ? "Publication non confirmée"
                    : "La journée n'a pas pu être enregistrée"}
                </p>
                <p className="text-meta text-muted-foreground">
                  {errorKind === "stopped"
                    ? error
                    : `${error} — rien n'est perdu : vos corrections sont toujours à l'écran.`}
                </p>
                {/* La sortie que l'incertitude exige : aller VOIR. On ne l'offre
                    que dans ce cas — sur un échec net, la bonne action est de
                    réessayer, et elle est déjà dans la barre. */}
                {errorKind === "stopped" && (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/">
                      <BookOpenText aria-hidden="true" />
                      Voir l’état dans le journal
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* « Enregistrer le brouillon » vit ICI et non dans la barre : c'est
              une action d'appoint (et de toute façon le brouillon est déjà
              enregistré à chaque lecture tranchée). La barre ne porte qu'une
              décision, ce qui la ramène de 157 px à 101 px. */}
          <Button
            variant="outline"
            className="w-full"
            loading={saving === "draft"}
            disabled={saving !== null}
            onClick={() => save(false)}
          >
            {published
              ? "Enregistrer les modifications"
              : "Enregistrer le brouillon"}
          </Button>
        </div>
      </div>

      {/* ── Barre d'action ───────────────────────────────────────────────────
          OPAQUE, et une seule décision. Deux corrections de fond :
          · `bg-surface-bar` (0,88 / 0,90 d'alpha) laissait dix nœuds de texte
            se lire à travers la barre, en dessous du seuil de contraste et hors
            d'atteinte du pointeur — un fantôme légible. Fond opaque, plus de
            fantôme ; un dégradé de 24 px au-dessus dit que le papier continue.
          · un bouton + une ligne de conséquence = 101 px. Avec l'en-tête de
            l'application (57 px), le chrome tombe à 18,7 % de l'écran (25,4 %
            avant, pour un plafond de 22 %) — et l'indice clavier partage la
            ligne de la conséquence au lieu de coûter 28 px de plus. */}
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 border-t bg-background px-4 pt-2 pb-safe-4"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background"
        />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          {/* LA CONSÉQUENCE EST TOUJOURS ÉCRITE, et la barre garde donc une
              hauteur CONSTANTE.
              Avant : une ligne quand il restait des lectures douteuses, et rien
              du tout sinon — sur un téléphone (où l'indice clavier est caché) la
              barre passait de 101 à 81 px selon l'état, et le geste le plus
              conséquent du produit (« ça part aux proches ») n'était nommé
              nulle part. Le parcours mesuré s'arrêtait sur un bouton qui ne
              disait pas ce qu'il faisait, puis sur un journal qui ne disait pas
              que c'était fait.
              Maintenant : une ligne, toujours. Ambre quand il reste un doute
              (l'avertissement passe devant), encre pâlie sinon pour dire la
              conséquence. Et l'indice clavier partage la ligne à partir de
              `md`, comme avant. */}
          {/* PENDANT LA PUBLICATION, LA LIGNE CHANGE DE MÉTIER. Elle disait
              « 1 lecture sera publiée telle quelle » au présent pendant que la
              requête partait, comme si rien ne se passait ; le seul signe de vie
              était une roue dans un bouton dont le libellé ne bougeait pas.
              Elle porte maintenant l'avancement (cf. `PublishProgress`), et la
              conséquence revient dès que c'est fini. */}
          {saving === "publish" ? (
            <PublishProgress
              seconds={publishSeconds}
              moments={items.length}
              pages={entry.attachments.length}
              republish={published}
              onStopWaiting={() => publishAbort.current?.abort()}
            />
          ) : (
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            {pending > 0 ? (
              <p className="flex min-w-0 items-start gap-2 text-meta text-warning">
                <TriangleAlert
                  aria-hidden="true"
                  /* mt-0.5 : même nudge optique de 2 px que ci-dessus. */
                  className="mt-0.5 size-4 shrink-0"
                />
                {pending === 1
                  ? "1 lecture sera publiée telle quelle."
                  : `${pending} lectures seront publiées telles quelles.`}
              </p>
            ) : (
              <p className="flex min-w-0 items-start gap-2 text-meta text-muted-foreground">
                <Send aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {published
                  ? "Vos proches liront la version corrigée."
                  : "La journée part aux proches, qui en sont prévenus."}
              </p>
            )}
            {/* L'INDICE CLAVIER EXISTE AUSSI À 390 px. Il était `hidden md:flex` :
                sur le viewport principal du produit, aucun chemin clavier n'était
                montré — alors qu'un clavier Bluetooth sur tablette et un clavier
                d'iPad sont exactement les cas où l'on relit une journée à deux
                mains. Il partage la ligne quand elle a la place, et passe à la
                ligne (`flex-wrap` du parent) quand elle ne l'a pas : la barre
                gagne 20 px sur mobile, et rien n'est rogné à 320 px. */}
            <p className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
              <Kbd>⌘/Ctrl</Kbd>
              <Kbd>⏎</Kbd>
              publier
            </p>
          </div>
          )}
          {/* Pleine largeur au pouce, au fer à droite à la souris : un slab
              groseille de 1 024 px n'est pas un bouton, c'est un mur. */}
          <Button
            size="lg"
            className="w-full md:w-auto md:self-end md:px-10"
            loading={saving === "publish"}
            disabled={saving !== null}
            onClick={() => save(true)}
          >
            {saving === "publish" ? null : <Check aria-hidden="true" />}
            {/* LE LIBELLÉ DIT CE QUI SE PASSE. « Publier la journée » avec une
                roue, c'était un bouton qui décrivait encore l'intention pendant
                que l'action, elle, durait. Le participe présent est la seule
                chose vraie entre le tap et la réponse. */}
            {saving === "publish"
              ? published
                ? "Republication en cours…"
                : "Publication en cours…"
              : published
                ? "Republier la journée"
                : "Publier la journée"}
          </Button>
        </div>
      </div>

      {/* Le garde-fou du travail non enregistré. Trois issues, dans l'ordre où
          on les veut : rester (le défaut, c'est l'annulation du dialogue),
          enregistrer puis partir, partir en perdant — et cette dernière est la
          seule marquée `destructive`, parce que c'est la seule qui détruit. */}
      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vos corrections ne sont pas encore enregistrées. La journée reste
              un brouillon, mais ce que vous venez d’écrire sera perdu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* L'ORDRE EST CALCULÉ, PAS SUBI. `AlertDialogFooter` est en
              `flex-col-reverse` sur mobile (et `flex-row justify-end` à partir
              de `sm`) : le DERNIER enfant du DOM est donc celui du HAUT au
              pouce. En écrivant l'ordre naturel (annuler, détruire, enregistrer)
              on obtenait un slab rouge « Quitter quand même » en tête d'un
              dialogue dont tout le propos est de NE PAS perdre le travail.
              L'ordre du DOM est donc renversé exprès :
                mobile, de haut en bas → Enregistrer puis quitter · Quitter quand
                  même · Rester (la recommandation domine, le retour est sous le
                  pouce) ;
                bureau, de gauche à droite → Rester · Quitter quand même ·
                  Enregistrer (l'action principale au fer à droite) ;
                clavier → Rester d'abord, donc la touche la plus sûre en premier.
              Et « Quitter quand même » n'est plus un aplat : rouge en ENCRE sur
              un bord, parce que c'est la sortie qu'on ne veut pas vendre. Le
              rouge plein reste pour ce qui détruit vraiment (supprimer une
              journée). */}
          <AlertDialogFooter>
            <AlertDialogCancel>Rester sur la journée</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className="text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => {
                leaving.current = true;
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              Quitter quand même
            </AlertDialogAction>
            <Button
              loading={saving === "draft"}
              onClick={async () => {
                // On ne quitte QUE si l'enregistrement est passé. Sinon le
                // dialogue reste ouvert et l'erreur s'affiche derrière, sur la
                // journée : le travail est toujours à l'écran.
                if (!(await save(false))) return;
                leaving.current = true;
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              Enregistrer, puis quitter
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmRemoveAttachment}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveAttachment(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette page ?</AlertDialogTitle>
            <AlertDialogDescription>
              La photo sera définitivement supprimée du carnet. Le récit déjà
              écrit n'est pas modifié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                attachmentToRemove && removeAttachment(attachmentToRemove.id)
              }
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Zone de texte qui grandit avec son contenu, PAR PAS DE 28 px — l'interligne
 * du cahier. Deux raisons, pas une :
 *   · on relit tout ce qu'on va publier. Un récit coupé à la septième ligne
 *     dans une zone qui défile est un récit publié sans avoir été relu, et
 *     c'est le seul écran dont c'est le métier.
 *   · la hauteur reste un multiple de la réglure, donc les lignes du cahier ne
 *     dérivent pas d'un demi-pas quand le texte s'allonge.
 */
function GrowingTextarea({
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
    // `height: 0` et non `auto` : une `<textarea>` en hauteur automatique
    // retombe sur son attribut `rows` (2 par défaut), donc `scrollHeight`
    // mesurait deux lignes même pour un titre d'une seule — et le champ gardait
    // une ligne vide sous le texte.
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
    // La largeur change (rotation, fenêtre) : le texte se rebrise, la hauteur
    // doit suivre.
    window.addEventListener("resize", fit);
    // Et surtout : on remesure quand les polices arrivent. Mesurée avec la
    // police de repli (plus large), « La journée des bulles de savon » tenait
    // sur deux lignes ; Fraunces chargé, elle en tient une — le champ restait
    // haut d'une ligne vide.
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

/* ------------------- La journée en un coup d'œil (lecture) ---------------- */

/**
 * Les moments de la journée, en clair, au-dessus du bouton.
 *
 * C'est la réparation du défaut de fond de l'écran : on ne publie pas ce qu'on
 * n'a pas vu. Une ligne par moment — 56 px, 76 quand la valeur demande deux
 * lignes — tuile d'icône (grise : la couleur de cet écran est la confiance, pas
 * la catégorie), libellé et état sur la première ligne, la valeur sur la
 * seconde. Rien n'est modifiable ici : ce qui se corrige est juste en dessous,
 * dans « Corriger les moments ».
 */
function MomentsGlance({
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
        /* Le vide dit ce qui manque ET ce qu'on peut faire quand même : une
           page de carnet sans tableau reste publiable, c'est le récit qui
           compte. */
        <p className="rounded-xl border border-dashed px-4 py-3 text-meta text-muted-foreground">
          Aucun repas, aucune sieste n'a été relevé sur cette page. Vous pouvez
          en ajouter juste en dessous — ou publier le récit seul.
        </p>
      ) : (
      <ul className="rounded-2xl border bg-card px-4 shadow-card">
        {items.map((it, i) => {
          const { label, value } = glanceOf(it);
          const Icon = ITEM_ICON[it.type];
          const haystack = `${label} ${value}`;
          const flag = flagged.some((re) => re.test(haystack));
          return (
            /* Deux lignes, trois colonnes : la tuile tient la hauteur, le
               libellé et l'état partagent la première ligne, la VALEUR prend
               toute la largeur en dessous. Avec la pastille posée à côté de la
               valeur, celle-ci n'avait plus que 198 px et « Gratin de
               courgettes, yaourt nature » se coupait au tiers ; là, elle en a
               298 et se lit. */
            <li
              key={i}
              className="grid min-h-14 grid-cols-[28px_1fr_auto] items-center gap-x-3 border-b py-2 last:border-b-0"
            >
              <span className="row-span-2 grid size-7 place-items-center self-center rounded-[9px] bg-muted">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="surtitre min-w-0 truncate text-muted-foreground">
                {label}
              </span>
              {flag ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-warning-bg px-2 text-xs font-bold text-warning">
                  <TriangleAlert aria-hidden="true" className="size-3" />
                  à vérifier
                </span>
              ) : (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-bg px-2 text-xs font-bold text-success">
                  <Check aria-hidden="true" className="size-3" />
                  confirmé
                </span>
              )}
              {/* `line-clamp-2` et non `truncate` : « Haricots verts, purée de
                  pommes de terre, poisson blanc » fait 538 px pour 284 px de
                  colonne — coupé à la moitié, ce n'est plus un aperçu de la
                  journée, c'est une devinette. Deux lignes suffisent à tout ce
                  qu'un carnet écrit, la ligne passe alors de 56 à 76 px, et
                  aucun texte n'est rogné horizontalement. */}
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

/* ===========================================================================
   L'ATTENTE DU GESTE LE PLUS CONSÉQUENT DU PRODUIT.

   Mesuré sur un PATCH /api/entries/:id qui ne revient jamais : à 1,5 s, 6 s et
   20 s l'écran était IDENTIQUE — un bouton désactivé, une roue, `aria-busy`, le
   libellé « Publier la journée » inchangé, la ligne du dessus disant toujours
   « 1 lecture sera publiée telle quelle » au présent. Aucun nœud `role="status"`
   ne se déclenchait, aucun temps, aucun compte, aucune escalade, aucune sortie.
   Le produit savait déjà faire mieux ailleurs (« Envoi de 1 page vers
   Racontine… », « page 2 sur 3 en cours de lecture », « Le carnet met du temps à
   venir ») : le seul endroit resté muet était celui qui compte.

   CE QU'ON PEUT DIRE HONNÊTEMENT, et rien de plus :
     · CE QUI PART : le nombre de moments et de pages — un compte, pas une roue.
     · DEPUIS QUAND : les secondes écoulées, en chiffres tabulaires. C'est la
       seule grandeur déterminée dont on dispose : le serveur ne rapporte pas
       l'avancement d'un PATCH, et inventer un pourcentage de publication serait
       un mensonge dessiné.
     · LA BARRE mesure donc le temps CONTRE LA DURÉE HABITUELLE (3 s), plafonnée
       à 92 % : elle n'atteint jamais le bout tant que ce n'est pas fini, et
       au-delà de l'habituel elle s'arrête et la phrase prend le relais.
     · L'ESCALADE : à 5 s « c'est plus long que d'habitude », à 12 s « le carnet
       ne répond toujours pas ». Deux phrases, deux annonces `role="status"`.
     · LA SORTIE, à partir de 3 s : « Arrêter d'attendre ». Elle n'est pas
       nommée « annuler » : abandonner la requête n'annule rien côté serveur, et
       le message qui suit le dit mot pour mot.
   =========================================================================== */

const PUBLISH_USUAL_SECONDS = 3;

function PublishProgress({
  seconds,
  moments,
  pages,
  republish,
  onStopWaiting,
}: {
  seconds: number;
  moments: number;
  pages: number;
  republish: boolean;
  onStopWaiting: () => void;
}) {
  const pct = Math.min(
    92,
    Math.round((seconds / PUBLISH_USUAL_SECONDS) * 100) || 8,
  );
  const what = [
    `${moments} moment${moments > 1 ? "s" : ""}`,
    pages > 0 ? `${pages} page${pages > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const line =
    seconds >= 12
      ? "Le carnet ne répond toujours pas."
      : seconds >= 5
        ? "C’est plus long que d’habitude."
        : republish
          ? `Republication en cours : ${what}.`
          : `Publication en cours : ${what}, puis les proches sont prévenus.`;

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] dur-slow ease-page"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        {/* Le compteur de secondes est HORS de la région annoncée : une annonce
            par seconde noierait la phrase qui, elle, porte le sens. */}
        <p role="status" className="min-w-0 text-meta text-muted-foreground">
          {line}
        </p>
        <p
          aria-hidden="true"
          data-tabular
          className="shrink-0 text-meta text-muted-foreground"
        >
          {seconds}&nbsp;s
        </p>
      </div>
      {seconds >= 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={onStopWaiting}
        >
          <X aria-hidden="true" />
          Arrêter d’attendre
        </Button>
      )}
    </div>
  );
}

/* ===========================================================================
   LA JOURNÉE EN LECTURE — ce que reçoit un LECTEUR sur /entries/:id.

   Le serveur donne la journée publiée à tous les membres du carnet ; c'est
   l'éditeur qui ne leur appartient pas. Cet écran n'est donc pas un refus : la
   journée est là, en entier, sur les lignes du cahier — seule la barre de
   publication a disparu, remplacée par la phrase qui explique pourquoi et par
   la sortie vers le journal.
   =========================================================================== */

function ReadOnlyDay({ entry }: { entry: Entry }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-12">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="surtitre text-muted-foreground">
            {[entry.child?.name, capitalize(longDate(entry.date)), SOURCE_LABELS[entry.source]]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="mt-1 font-serif text-title font-semibold text-balance">
            {entry.title || "La journée"}
          </h1>
        </div>
        <Badge variant="success" className="mt-0.5">
          <Check aria-hidden="true" />
          Publiée
        </Badge>
      </header>

      <article className="relative overflow-hidden rounded-2xl border bg-card py-4 pr-5 pl-7 shadow-card">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]"
        />
        {entry.story ? (
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 pr-5 pl-7">
            <p className="carnet-story text-foreground">{entry.story}</p>
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">
            Cette journée n’a pas de récit : seules les pages du carnet ont été
            gardées.
          </p>
        )}
        {entry.highlight && (
          <p className="mt-4 flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-ui">
            <Star
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>
              <span className="font-bold">Le temps fort</span> —{" "}
              {entry.highlight}
            </span>
          </p>
        )}
      </article>

      {/* LA JOURNÉE, pas seulement le récit. Un lecteur arrive ici par une
          notification (« la journée de Louise est publiée » -> /entries/:id) :
          il doit y trouver la journée ENTIÈRE — les moments et l'humeur compris —
          et non un extrait qui l'obligerait à repartir vers le journal pour lire
          ce qu'il venait lire. Mêmes libellés, mêmes glyphes, même ordre que
          partout ailleurs ; les pastilles de confiance, elles, restent à l'écran
          de relecture : elles ne veulent rien dire pour qui ne tranche pas. */}
      {entry.items.length > 0 && (
        <ul className="mt-4 rounded-2xl border bg-card px-4 shadow-card">
          {toDraftItems(entry.items).map((it, i) => {
            const { label, value } = glanceOf(it);
            const Icon = ITEM_ICON[it.type];
            return (
              <li
                key={i}
                className="flex min-h-14 items-center gap-3 border-b py-2 last:border-b-0"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-muted">
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0">
                  <span className="surtitre block text-muted-foreground">
                    {label}
                  </span>
                  <span className="block text-ui text-pretty">{value}</span>
                </span>
              </li>
            );
          })}
          {entry.mood && (
            <li className="flex min-h-14 items-center gap-3 border-b py-2 last:border-b-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-muted">
                <Smile
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0">
                <span className="surtitre block text-muted-foreground">
                  Humeur
                </span>
                <span className="block text-ui text-pretty">{entry.mood}</span>
              </span>
            </li>
          )}
        </ul>
      )}

      {entry.attachments.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="surtitre text-muted-foreground">
            La page du carnet
            {entry.attachments.length > 1 ? ` · ${entry.attachments.length}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {entry.attachments.map((a, i) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ouvrir la page ${i + 1} en grand`}
                className="seam block overflow-hidden rounded-xl bg-muted"
              >
                <img
                  src={a.thumbUrl}
                  alt={`Page ${i + 1} du carnet`}
                  className="block aspect-square w-full object-cover object-top"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-meta text-muted-foreground">
        <BookOpenText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Vous suivez ce carnet en{" "}
          <span className="font-bold text-foreground">lecture</span> : la
          journée telle qu’elle a été publiée. La corriger revient à la famille
          qui tient le carnet.
        </span>
      </p>

      <Button asChild className="mt-4 w-full">
        <Link to="/">
          <BookOpenText aria-hidden="true" />
          Revenir au journal
        </Link>
      </Button>
    </div>
  );
}

/** Touche clavier montrée dans la barre d'action (chemin clavier visible).
 *  `py-0` + `leading-5` : la capsule mesure 20 px, la HAUTEUR D'UNE LIGNE de la
 *  barre. C'est ce qui permet de montrer le chemin clavier à 390 px (où il
 *  passe à la ligne) sans faire grossir le chrome : 131 px de barre avec des
 *  capsules à `py-1`, 121 px avec celles-ci — 21,1 % de l'écran au lieu de
 *  22,3 %, sous le plafond de 22 % que cet écran s'est fixé. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border bg-card px-1.5 font-sans text-overline font-bold leading-5 tracking-normal text-foreground">
      {children}
    </kbd>
  );
}

/**
 * UNE PAGE DE CARNET, DANS LE SENS OÙ ON PEUT LA LIRE.
 *
 * Un carnet de liaison se photographie d'une main, au-dessus d'un plan de
 * travail, souvent en tendant le bras par-dessus la table de la nounou : une
 * page sur deux arrive de travers ou franchement à l'envers. L'écran de
 * relecture la posait alors telle quelle — et la SEULE chose que cet écran
 * demande est justement de confronter ce qui est écrit à ce qui a été lu. Une
 * page à l'envers rend cette confrontation impossible : il fallait ouvrir la
 * photo dans un onglet, puis tourner la tête.
 *
 * Le bouton tourne la page d'un quart de tour à chaque appui. C'est une ROTATION
 * DE LECTURE, pas une correction du fichier : rien n'est réenregistré, rien
 * n'est envoyé au serveur, et la page repart droite à la prochaine ouverture.
 * C'est exactement ce qu'on veut ici — on relit, on ne retouche pas — et c'est
 * ce que dit l'infobulle.
 *
 * La géométrie : à un quart ou trois quarts de tour, la largeur et la hauteur
 * s'échangent. Le cadre prend donc le rapport INVERSE de l'image et celle-ci est
 * dimensionnée pour que son encombrement APRÈS rotation remplisse exactement ce
 * cadre — sans quoi une page tournée déborderait sur la colonne voisine ou
 * laisserait une bande de vide sous elle. Les dimensions viennent du serveur
 * quand il les connaît, du chargement de l'image sinon.
 */
function SourcePage({
  attachment,
  index,
  total,
  quarter,
  onRotate,
  removing,
  onRemove,
}: {
  attachment: AttachmentRef;
  index: number;
  total: number;
  quarter: number;
  onRotate: () => void;
  removing: boolean;
  onRemove: (() => void) | null;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    attachment.width && attachment.height
      ? { w: attachment.width, h: attachment.height }
      : null,
  );
  // Tant que les proportions sont inconnues, la page reste droite : mieux vaut
  // un bouton qui attend une fraction de seconde qu'une image qui déborde.
  const known = natural !== null;
  const q = known ? ((quarter % 4) + 4) % 4 : 0;
  const quart = q % 2 === 1;
  const w = natural?.w ?? 1;
  const h = natural?.h ?? 1;

  return (
    <figure className="relative">
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Ouvrir la page ${index + 1} en grand`}
        className="seam relative block w-full overflow-hidden rounded-xl bg-muted"
        style={
          known
            ? { aspectRatio: quart ? `${h} / ${w}` : `${w} / ${h}` }
            : undefined
        }
      >
        <img
          src={attachment.url}
          alt={`Page ${index + 1} du carnet`}
          onLoad={(e) => {
            if (known) return;
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight)
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          className={cn(
            "block max-w-none",
            known
              ? "absolute top-1/2 left-1/2 origin-center transition-transform dur-base ease-carnet"
              : "w-full",
          )}
          style={
            known
              ? {
                  width: quart ? `${(w / h) * 100}%` : "100%",
                  transform: `translate(-50%, -50%) rotate(${q * 90}deg)`,
                }
              : undefined
          }
        />
      </a>
      <figcaption className="surtitre mt-2 text-muted-foreground">
        Page {index + 1} sur {total}
      </figcaption>
      {/* En bas, sur la photo : en haut, les boutons se posaient sur la date
          manuscrite, la seule ligne qu'on veut relire. */}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="absolute bottom-9 left-2 rounded-full"
        disabled={!known}
        onClick={onRotate}
        title="Tourner la page à l'écran (la photo n'est pas modifiée)"
        aria-label={`Tourner la page ${index + 1} d'un quart de tour à l'écran`}
      >
        <RotateCw aria-hidden="true" />
      </Button>
      {onRemove && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="absolute right-2 bottom-9 rounded-full"
          loading={removing}
          onClick={onRemove}
          aria-label={`Retirer la page ${index + 1}`}
        >
          {removing ? null : <X aria-hidden="true" />}
        </Button>
      )}
    </figure>
  );
}

function SourceTab({
  id,
  panel,
  selected,
  onSelect,
  Icon,
  children,
}: {
  id: string;
  panel: string;
  selected: boolean;
  onSelect: () => void;
  Icon: typeof Images;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panel}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-meta font-bold",
        "transition-colors dur-fast ease-carnet",
        selected
          ? "bg-card text-foreground shadow-card"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/* ------------------------------ Les états -------------------------------- */

/**
 * Squelette : la FORME de l'écran de relecture — l'en-tête, la ligne de
 * source, une carte à vérifier, le titre et le récit sur les lignes du cahier.
 */
function ReviewSkeleton() {
  /* Le chargement DIT CE QU'IL FAIT, et il le dit deux fois : au bout de trois
     secondes, la ligne d'état change pour nommer la cause probable au lieu de
     répéter la même phrase indéfiniment. Aucune roue, aucune deuxième boucle :
     c'est le balayage des squelettes (déjà déclaré dans index.css) qui respire. */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-32">
      {/* Le rail n'est PAS un squelette : on sait déjà où l'on est dans le
          parcours avant que la journée arrive, et l'écran ne saute pas quand
          elle arrive. */}
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "done" },
          { key: "review", label: "Relecture", state: "current" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="mb-4 w-full"
      />
      {/* La ligne d'état est EN HAUT, pas en bas : en bas de 1 200 px de
          squelette, elle était sous la ligne de flottaison — un écran qui
          charge sans le dire. */}
      <p
        role="status"
        className="mb-4 flex items-center gap-2 text-meta text-muted-foreground"
      >
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
        {slow
          ? "Le carnet met du temps à venir — la connexion est peut-être lente."
          : "Ouverture de la journée…"}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="skeleton h-6 w-56" />
            <div className="skeleton h-3 w-40" />
          </div>
          <div className="skeleton h-6 w-28 rounded-full" />
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card">
          <div className="skeleton size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-bg p-3">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-5 w-24" />
          <div className="flex gap-2">
            <div className="skeleton h-11 w-24 rounded-xl" />
            <div className="skeleton h-11 w-24 rounded-xl" />
          </div>
        </div>
        {/* La forme exacte de la réponse : cinq lignes de moments de 56 px,
            puis la ligne « Corriger les moments », puis le titre et le récit
            sur les lignes du cahier. L'écran ne saute pas quand la journée
            arrive, et le bas de la page n'est plus 230 px de vide. */}
        <div className="flex flex-col gap-2">
          <div className="skeleton h-3 w-20" />
          <div className="rounded-2xl border bg-card px-4 shadow-card">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="grid min-h-14 grid-cols-[28px_1fr_auto] items-center gap-3 border-b py-2 last:border-b-0"
              >
                <div className="skeleton size-7 rounded-[9px]" />
                <div className="flex flex-col gap-2">
                  <div className="skeleton h-3 w-16" />
                  <div
                    className="skeleton h-4"
                    style={{ width: `${68 - i * 7}%` }}
                  />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card">
          <div className="flex flex-col gap-2">
            <div className="skeleton h-4 w-44" />
            <div className="skeleton h-3 w-56" />
          </div>
          <div className="skeleton size-4 shrink-0 rounded-sm" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="skeleton h-4 w-36" />
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="skeleton h-6 w-full" />
            <div className="skeleton h-6 w-2/3" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="skeleton h-4 w-44" />
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-3/5" />
          </div>
        </div>
      </div>
      {/* La barre d'action existe déjà, désactivée, à sa hauteur définitive :
          l'écran ne saute pas quand la journée arrive, et on sait tout de suite
          ce qu'on viendra faire ici. */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-background px-4 pt-2 pb-safe-4">
        <div className="mx-auto w-full max-w-5xl">
          {/* La ligne de conséquence a sa place gardée : la barre ne change pas
              de hauteur quand la journée arrive avec des lectures à vérifier. */}
          <div className="skeleton mb-2 h-5 w-56" />
          {/* La barre montre l'action à venir, désactivée — pas une deuxième
              fois « Ouverture… » (le squelette le dit déjà), et pas de roue :
              une boucle de 1000 ms de plus n'est pas au budget mouvement. */}
          <Button size="lg" className="w-full" disabled>
            Publier la journée
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lecture en cours. La progression est RÉELLE (page N sur M du carnet, pas une
 * roue), et les trois lignes fantômes ont la forme de la réponse qui arrive.
 */
function ProcessingView({ attachments }: { attachments: Entry["attachments"] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (attachments.length < 2) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % attachments.length);
    }, 1900);
    return () => clearInterval(t);
  }, [attachments.length]);

  const current = attachments[idx];
  const total = Math.max(attachments.length, 1);
  // On lit la page idx+1 : les pages précédentes sont faites, celle-ci est en
  // cours. La barre s'arrête donc au milieu du dernier pas — elle ne dit jamais
  // « terminé » avant de l'être.
  const pct = Math.round(((idx + 0.5) / total) * 100);

  return (
    /* gap-4 et vignette à 224 px : à gap-5/256, la sortie « Revenir au
       journal » tombait 39 px sous la ligne de flottaison. Un écran d'attente
       qui cache sa sortie est un cul-de-sac de 39 px. */
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-4 p-4">
      {/* Le rail est le PREMIER objet de l'écran d'attente : « la photo est
          partie, on en est à la lecture, il reste deux temps ». C'est la réponse
          à la seule question qu'on se pose en attendant. */}
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "current" },
          { key: "review", label: "Relecture", state: "todo" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="w-full"
      />
      <span className="grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary">
        <ScanLine className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-serif text-title font-semibold">
          Racontine lit le carnet
        </h1>
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          La page est transcrite, puis mise en récit. Quelques secondes
          suffisent — vous relirez tout avant publication.
        </p>
      </div>

      {current && (
        /* `w-fit` : le cadre épouse la page au lieu de laisser deux bandes
           grises de chaque côté d'une image plus haute que large. */
        <div className="seam relative w-fit max-w-64 overflow-hidden rounded-xl">
          <img
            key={current.id}
            src={current.thumbUrl}
            alt={`Page ${idx + 1} du carnet, en cours de lecture`}
            className="animate-scan-fade block max-h-56 w-auto"
          />
          {/* Boucle déclarée (1800 ms) : elle n'porte aucune information, et
              elle s'arrête sous prefers-reduced-motion. */}
          <div className="animate-scan-sweep pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-primary-soft to-transparent" />
        </div>
      )}

      {/* Progression DÉTERMINÉE : la page qu'on lit sur celles qu'on a
          envoyées. Une roue qui tourne ne dit rien ; « page 2 sur 3 », si. */}
      <div className="flex w-full max-w-64 flex-col gap-2">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] dur-slow ease-page"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          role="status"
          className="text-center text-meta text-muted-foreground"
          data-tabular
        >
          Page {idx + 1} sur {total} en cours de lecture
        </p>
      </div>

      {/* La forme de la réponse : trois moments qui vont s'écrire. */}
      <ul aria-hidden="true" className="flex w-full flex-col gap-2">
        {[Soup, Moon, Sparkles].map((Icon, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <span className="flex flex-1 flex-col gap-2">
              <span className="skeleton h-3 w-16" />
              <span className="skeleton h-4" style={{ width: `${72 - i * 12}%` }} />
            </span>
          </li>
        ))}
      </ul>

      {/* Jamais de cul-de-sac, même pendant une attente — et cette sortie DIT
          maintenant où elle mène. Elle était une promesse à moitié fausse : le
          journal, lui, ne sondait rien, donc la carte y restait « Lecture en
          cours » jusqu'à un rechargement à la main. Depuis que le fil suit la
          lecture (cf. `Timeline.tsx`), on peut écrire la phrase — et c'est elle
          qui rend le départ gratuit. */}
      <div className="flex w-full flex-col items-center gap-1">
        <Button asChild variant="ghost" className="text-muted-foreground">
          <Link to="/">Revenir au journal</Link>
        </Button>
        <p className="max-w-[34ch] text-center text-meta text-muted-foreground">
          La journée s’y affichera d’elle-même dès qu’elle est prête. Vous
          pouvez fermer l’app.
        </p>
      </div>
    </div>
  );
}

/** La lecture a échoué : cause, sorties (relancer, rephotographier, supprimer). */
function ReadFailed({
  when,
  reason,
  canRetry,
  retrying,
  error,
  onRetry,
  onDelete,
  confirmOpen,
  onConfirmOpenChange,
  onConfirmDelete,
}: {
  when: string;
  reason: string | null;
  /** Des pages sont sur le serveur ET l'appelant a le droit de les relire. */
  canRetry: boolean;
  retrying: boolean;
  error: string | null;
  onRetry: () => void;
  onDelete: () => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}) {
  return (
    <section className="rise-enter mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-5 p-4">
      {/* Le rail porte l'ÉCHEC à son pas — le composant dessine cet état depuis
          le début (triangle sur fond destructive-soft) et personne ne s'en
          servait. On voit d'un coup d'œil que c'est la LECTURE qui a échoué, pas
          la photo ni la publication. */}
      <CaptureSteps
        steps={[
          { key: "photo", label: "Photo", state: "done" },
          { key: "read", label: "Lecture", state: "failed" },
          { key: "review", label: "Relecture", state: "todo" },
          { key: "share", label: "Partage", state: "todo" },
        ]}
        className="w-full"
      />
      <span className="grid size-16 place-items-center rounded-3xl bg-warning-bg text-warning">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="surtitre text-muted-foreground">{when}</p>
        <h1 className="font-serif text-title font-semibold">
          La page n'a pas pu être lue
        </h1>
        {/* La CAUSE, telle que le serveur la nomme (et elle est écrite pour un
            parent, pas pour un journal de logs) — pas rangée derrière une
            disclosure « détail technique ». */}
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          {reason ??
            "La lecture s'est arrêtée avant la fin, sans raison enregistrée."}
        </p>
        <p className="max-w-[34ch] text-meta text-muted-foreground">
          Rien n'a été publié et rien n'a été perdu : vos pages sont
          conservées telles quelles.
        </p>
      </div>

      {/* LES CONSEILS DE PRISE DE VUE NE S'ADRESSENT QU'À UNE PAGE ILLISIBLE.
          Quand les pages sont là et relisibles, la première sortie est la
          RELANCE, pas la reprise de photo : le carnet papier est souvent déjà
          reparti chez la nounou, et « reprenez la photo » est alors un conseil
          qu'on ne peut pas suivre. On ne montre donc les conseils de cadrage
          que lorsqu'il n'y a effectivement rien à relire. */}
      {!canRetry && (
        <ul className="flex w-full flex-col gap-2">
          <Tip Icon={Camera}>
            Toute la page dans le cadre, à plat, sans doigt sur le bord.
          </Tip>
          <Tip Icon={Sparkles}>
            Une lumière du côté de la fenêtre plutôt qu'au-dessus : moins d'ombre
            sur l'écriture.
          </Tip>
        </ul>
      )}

      {error && (
        <p role="alert" className="text-ui text-destructive">
          {error}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        {/* La relance prend la place de tête : c'est la sortie qui n'existait
            pas, et celle qui n'exige rien de plus que ce qu'on a déjà donné. */}
        {canRetry && (
          <Button size="lg" loading={retrying} onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Relancer la lecture
          </Button>
        )}
        <Button
          asChild
          size={canRetry ? "default" : "lg"}
          variant={canRetry ? "outline" : "default"}
        >
          <Link to="/capture">
            <Camera aria-hidden="true" />
            Reprendre la photo
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Revenir au journal</Link>
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
          Supprimer cette journée
        </Button>
      </div>

      <DeleteDialog
        open={confirmOpen}
        onOpenChange={onConfirmOpenChange}
        onConfirm={onConfirmDelete}
      />
    </section>
  );
}

/** La journée existe mais n'a pas pu être ouverte : ce n'est pas « vide ». */
function LoadFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rise-enter mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-lg flex-col items-center justify-center gap-5 p-4">
      {/* AMBRE et non ROUGE. Deux raisons, et la première est mesurée :
          --primary (groseille) et --destructive sont à 1,08:1 de clarté et 17°
          de teinte l'un de l'autre en clair (1,00:1 / 14° en sombre), donc une
          tuile rouge à 200 px d'un bouton groseille faisait DEUX aplats saturés
          qui se lisaient comme un seul système — l'écran n'avait plus de
          dimension colorée unique. La seconde est sémantique : le texte dit
          « elle n'est pas perdue », c'est un incident, pas une destruction.
          Rouge reste réservé à ce qui détruit (les dialogues de suppression). */}
      <span className="grid size-16 place-items-center rounded-3xl bg-warning-bg text-warning">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-serif text-title font-semibold">
          Cette journée ne s'ouvre pas
        </h1>
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          Elle n'est pas perdue : c'est la connexion au carnet qui a échoué.
          Réessayez — si cela persiste, le serveur redémarre peut-être.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Réessayer
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Revenir au journal</Link>
        </Button>
      </div>
      <TechnicalDetail message={message} />
    </section>
  );
}

function TechnicalDetail({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  return (
    /* La ligne de dépli était collée à gauche au milieu d'un bloc centré : elle
       cassait l'axe. Elle est centrée comme le reste, et le chevron tourne
       vraiment (piloté par l'état — `group-open:` ne compile pas ici). */
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="w-full"
    >
      <summary className="tap flex cursor-pointer list-none items-center justify-center gap-2 text-meta text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform dur-base ease-carnet",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
        Détail technique
      </summary>
      <p className="rounded-lg bg-muted px-4 py-3 text-left text-meta text-muted-foreground">
        {message}
      </p>
    </details>
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

function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. L'entrée et ses photos seront
            supprimées.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function pruneEmpty(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * Empreinte d'une journée, pour savoir s'il y a du travail à perdre.
 *
 * Elle applique EXACTEMENT les normalisations de `currentPatch` — coupe des
 * blancs, chaîne vide ramenée à `null`, champs vides élagués des moments,
 * positions renumérotées — et dans le MÊME ordre de clés, puisque la
 * comparaison se fait sur le JSON. Toute divergence ferait apparaître une
 * modification là où il n'y en a pas, et le garde-fou crierait à l'ouverture de
 * l'écran.
 */
function fingerprint(v: {
  title: string | null;
  story: string | null;
  highlight: string | null;
  mood: string | null;
  transcription: string | null;
  source: EntrySource;
  date: string;
  items: DraftItem[];
}): string {
  return JSON.stringify({
    title: v.title?.trim() || null,
    story: v.story?.trim() || null,
    highlight: v.highlight?.trim() || null,
    mood: v.mood || null,
    transcription: v.transcription || null,
    source: v.source,
    date: v.date,
    items: v.items
      .map((it, position) => ({
        type: it.type,
        data: pruneEmpty(it.data),
        position,
      }))
      .filter((it) => Object.keys(it.data).length > 0),
  });
}

/** Tolère les anciennes entrées où `uncertainties` était un simple tableau de chaînes. */
function normalizeUncertainties(raw: unknown): Uncertainty[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((u) =>
    typeof u === "string"
      ? { original: u, contexte: "", suggestions: [], champ: null, resolved: null }
      : (u as Uncertainty),
  );
}

/* --------------------------- Incertitude à valider ------------------------ */

/**
 * Une lecture douteuse, et la façon de la trancher en un geste.
 *
 * · AMBRE tant que ce n'est pas tranché, VERT dès que c'est fait : la couleur
 *   dit l'état de confiance, jamais la catégorie. Elle est toujours doublée
 *   d'un glyphe (`TriangleAlert` / `Check`) — l'état reste lisible en noir et
 *   blanc.
 * · Le mot lu est en sérif, comme sur le papier ; le contexte est en encre
 *   pâlie, parce que ce n'est pas lui qu'on corrige.
 * · Toutes les encres sont à pleine opacité. `text-warning/70` sur
 *   `--warning-bg` donnait 3,1:1 : un modificateur d'opacité sur une COULEUR
 *   DE TEXTE est un échec de contraste silencieux.
 */
/**
 * Une lecture tranchée. Le diff est explicite (« Ninon » → Manon) et il reste
 * une sortie : le serveur refuse de re-trancher (409, et c'est juste), mais le
 * mot est toujours modifiable à la main — « Revenir sur ce choix » emmène le
 * clavier sur le champ où la substitution a eu lieu.
 */
function ResolvedReading({
  id,
  item,
  onEdit,
}: {
  id: string;
  item: Uncertainty;
  onEdit: () => void;
}) {
  /* « Gardé tel quel » se compare sur le MOT, pas sur sa citation : une vieille
     journée porte un `original` guillemeté que le bouton « Garder » n'a jamais
     renvoyé tel quel — la ligne annonçait alors une correction « « mot » → mot »
     qui n'a jamais eu lieu. */
  const kept = unquoted(item.resolved ?? "") === unquoted(item.original);
  /* TOUTE LA LIGNE est la cible : un petit « Revenir dessus » de 44 px à droite
     rajoutait un objet et 8 px de hauteur pour la même action. */
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

/**
 * Une lecture à trancher, repliée : on n'ouvre qu'une carte à la fois pour que
 * les moments de la journée tiennent dans le même écran. La ligne dit quand
 * même le mot lu, où il se trouve, et qu'elle attend quelque chose.
 */
function CollapsedReading({
  id,
  item,
  onOpen,
}: {
  id: string;
  item: Uncertainty;
  onOpen: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Trancher la lecture « ${unquoted(item.original)} »`}
      className="tap flex min-h-14 w-full items-center gap-3 rounded-xl border border-warning bg-warning-bg px-3 py-2 text-left transition-colors dur-fast ease-carnet hover:bg-card"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <span className="surtitre block truncate text-warning">
          À vérifier{item.champ ? ` · ${FIELD_ORIGIN[item.champ]}` : ""}
        </span>
        <span className="block truncate font-serif text-ui text-foreground">
          « {unquoted(item.original)} »
        </span>
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-warning" />
    </button>
  );
}

function UncertaintyCard({
  id,
  item,
  phrase,
  disabled,
  resolving,
  onResolve,
}: {
  id: string;
  item: Uncertainty;
  /** La phrase du carnet où ce mot a été lu, `null` si on ne l'y retrouve pas. */
  phrase: string | null;
  disabled: boolean;
  resolving: boolean;
  onResolve: (value: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const [choice, setChoice] = useState<string | null>(null);

  /** Le mot lu, sans la citation que le modèle met parfois autour. */
  const word = unquoted(item.original);

  // Le mot lu figure parfois déjà dans les suggestions : on ne propose pas deux
  // fois la même réponse, « Garder » porte déjà ce choix. La comparaison est
  // faite hors casse et hors guillemets, sinon « Gratin » et « gratin »
  // s'affichaient tous les deux à côté de « Garder « gratin » ».
  const suggestions = item.suggestions
    .map((sug) => unquoted(sug))
    .filter(
      (sug, i, self) =>
        sug &&
        sug.toLowerCase() !== word.toLowerCase() &&
        self.findIndex((o) => o.toLowerCase() === sug.toLowerCase()) === i,
    );

  /** La saisie libre est derrière une pastille : elle coûtait 52 px de hauteur
      en permanence pour un usage rare, et ces 52 px sont exactement ce qui
      manquait pour voir la journée.
      SAUF QUAND IL N'Y A RIEN D'AUTRE. Sans suggestion, la carte ne proposait
      que « Garder » et une pastille « Autre… » : le seul geste utile — écrire ce
      qui est sur le papier — demandait un tap de plus, et rien ne disait que la
      machine n'avait AUCUNE autre lecture à offrir. Le champ est alors ouvert
      d'emblée, et la carte le dit. */
  const [customOpen, setCustomOpen] = useState(suggestions.length === 0);
  /** Ouvert PAR UN GESTE, et non parce qu'il n'y avait rien d'autre à montrer :
      seul le premier cas mérite le clavier. Sans cette distinction, l'`autoFocus`
      du champ et le focus donné à la carte à l'arrivée sur l'écran se
      disputaient le curseur, et la carte gagnait — le champ perdait le caret
      qu'il venait de prendre. */
  const [customAsked, setCustomAsked] = useState(false);

  function pick(value: string) {
    setChoice(value);
    onResolve(value);
  }

  return (
    <div
      id={id}
      /* `tabIndex={-1}` : la carte n'entre pas dans l'ordre de tabulation (elle
         n'est pas un contrôle), mais elle peut RECEVOIR le focus à l'arrivée sur
         l'écran — c'est la chose qui demande un humain, et c'est donc elle qu'on
         annonce et depuis laquelle la première tabulation tombe sur les
         suggestions. Le groupe porte son nom : « Lecture à vérifier : gratin ». */
      tabIndex={-1}
      role="group"
      /* La citation entre AUSSI dans le nom du groupe : au lecteur d'écran, la
         carte annonçait « Lecture à vérifier : écrite » — un mot hors de toute
         phrase, c'est-à-dire la difficulté même qu'on corrige à l'œil. */
      aria-label={`Lecture à vérifier : ${word}${phrase ? `, dans « ${phrase} »` : ""}`}
      className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-bg p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
    >
      <p className="surtitre flex items-center gap-2 text-warning">
        <TriangleAlert aria-hidden="true" className="size-4" />
        À vérifier
        {item.champ ? ` · ${FIELD_ORIGIN[item.champ]}` : ""}
      </p>

      {/* Souligné ondulé ambre : l'idiome universel du mot douteux. La forme
          double la couleur — sans l'ambre, le trait dit encore « incertain ». */}
      <p className="font-serif text-body text-foreground">
        «{" "}
        <span className="underline decoration-warning decoration-wavy underline-offset-4">
          {word}
        </span>{" "}
        »
      </p>
      {/* LA PHRASE DU CARNET, PAS UNE PÉRIPHRASE. « mot incertain après
          «Nounour» dans la ligne du matin » demande de chercher un repère pour
          chercher un mot ; « Nott. **Befant.** pour le relais, premier atelier
          musique » se retrouve d'un balayage sur la photo, parce que c'est
          littéralement ce qui y est écrit. Sérif comme la page, encre pleine sur
          le mot, encre pâlie autour : la phrase situe, elle ne se corrige pas.
          Le filet à gauche la donne pour une CITATION — sans lui, elle se lisait
          comme une suggestion de plus. */}
      {phrase && (
        <p className="border-l-2 border-warning pl-3 font-serif text-meta text-muted-foreground">
          {highlightToken(phrase, word)}
        </p>
      )}
      {/* La glose du modèle reste SOUS la citation : elle dit pourquoi la
          machine doute (« abréviation », « peut-être Note : bébé/enfant »), ce
          que la phrase ne dit pas. La citation situe, la glose explique. */}
      {item.contexte && (
        <p className="text-meta text-muted-foreground">
          {highlightToken(item.contexte, word)}
        </p>
      )}
      {/* L'ABSENCE DE SUGGESTION EST UNE INFORMATION. La carte montrait alors un
          mot et deux boutons sans jamais dire pourquoi elle ne proposait rien :
          on ne pouvait pas distinguer « la machine n'a aucune autre lecture » de
          « la carte est cassée ». */}
      {suggestions.length === 0 && (
        <p className="text-meta text-muted-foreground">
          Aucune autre lecture proposée : gardez ce mot, ou écrivez ce qui est
          sur le papier.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* La suggestion est une pastille POSÉE sur le champ ambre : c'est son
            LISERÉ ambre qui l'identifie, pas son fond — le fond est la feuille,
            donc la pastille reste nette le jour comme la nuit, et l'encre reste
            l'ambre à pleine opacité (6,4:1 le jour, 9:1 la nuit). « Garder »
            n'a pas de liseré : c'est un choix, pas une correction. */}
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
          /* Le MOT, pas la citation : « Garder » écrit sa valeur dans le récit
             publié — y renvoyer « « Roueil » » y poserait les guillemets. */
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
          {/* Le bouton n'existe que quand il a quelque chose à valider : au
              repos, un rond gris désactivé n'était qu'un trou dans la carte. */}
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

/* ------------------------------ Éditeur d'items --------------------------- */

const FIELD_LABELS: Record<string, string> = {
  moment: "Moment",
  contenu: "Contenu",
  appetit: "Appétit",
  debut: "Début",
  fin: "Fin",
  note: "Note",
  label: "Activité",
  text: "Anecdote",
};

const ADD_TYPES: ItemType[] = ["meal", "nap", "activity", "anecdote", "health"];

/**
 * Les champs de PROSE passent en zone de texte qui grandit : « Circuit de train
 * en bois dans le couloir » se lisait coupé en plein mot dans un champ d'une
 * ligne. Les heures et les libellés courts restent des champs.
 */
const LONG_FIELDS = new Set(["contenu", "note", "text", "label"]);

function ItemEditor({
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
      {ADD_TYPES.map((type) => {
        const rows = items
          .map((it, idx) => ({ it, idx }))
          .filter((x) => x.it.type === type);
        const Icon = ITEM_ICON[type];
        return (
          <section key={type} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              {/* Tuile GRISE, pas le feutre de la catégorie : sur cet écran,
                  la couleur ne dit que la confiance (voir lib/ui.ts). */}
              <h3 className="flex items-center gap-2 text-ui font-bold">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {ITEM_LABELS[type]}
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
                    {Object.keys(it.data).map((key) => (
                      <label key={key} className="flex flex-col gap-1">
                        <span className="surtitre text-muted-foreground">
                          {FIELD_LABELS[key] ?? key}
                        </span>
                        {LONG_FIELDS.has(key) ? (
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
                    aria-label={`Supprimer ce moment (${ITEM_LABELS[type]})`}
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
