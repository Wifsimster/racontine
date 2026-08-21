import type { Uncertainty, UncertaintyField } from "./db/schema.js";

/* ===========================================================================
   REMETTRE UNE INCERTITUDE EN FORME.

   Une incertitude a un contrat simple : `original` porte LE MOT tel qu'il a été
   lu sur le papier, `contexte` porte l'explication, `suggestions` porte les
   lectures alternatives. Le VLM, lui, écrit régulièrement tout dans le premier
   champ :

       original   = "«Roueil» : mot incertain après «Nounour» dans la ligne
                     du matin, lecture incertaine"
       contexte   = ""
       suggestions = []

   Trois conséquences, toutes visibles à l'écran :

   · LA CARTE DEVIENT ILLISIBLE. L'écran de relecture encadre `original` de
     guillemets français — la phrase s'affichait donc « « Roueil » : mot
     incertain… », guillemets doublés, sur trois lignes, et le bouton reprenait
     la phrase entière : « Garder « «Roueil» : mot incertain après… » ».
   · LA SUBSTITUTION NE SE FAIT JAMAIS. Une fois la lecture tranchée, le serveur
     remplace `original` par la valeur choisie dans le titre, le récit, le temps
     fort et la transcription (voir routes/entries.ts). Aucun de ces champs ne
     contient la PHRASE — le remplacement ne trouve rien, et le mot douteux
     reste tel quel dans ce qui part aux proches. Le parent a tranché pour rien.
   · LES MOMENTS SE DISENT TOUS « CONFIRMÉS ». La liste de la journée marque
     « à vérifier » les lignes qui contiennent un mot encore douteux ; elle
     cherchait la phrase entière, ne la trouvait nulle part, et affichait donc
     cinq pastilles vertes sous une pastille « 5 à vérifier ».

   On remet donc la phrase à plat AVANT de la stocker (lecture d'un carnet) et
   AVANT de s'en servir (journées déjà en base, qu'aucune migration ne réécrit).
   La règle est volontairement prudente : un `original` qui ressemble déjà à un
   mot lu — court, sans deux-points, sans guillemet ouvrant — traverse cette
   fonction sans être touché.
   =========================================================================== */

/** Au-delà, ce n'est plus un mot lu sur un carnet : c'est une phrase. */
const MAX_TOKEN = 40;

/** Les paires de guillemets qu'un modèle utilise pour citer un mot. */
const QUOTE_PAIRS: [string, string][] = [
  ["«", "»"],
  ["\u201c", "\u201d"],
  ["\u2039", "\u203a"],
  ['"', '"'],
  ["'", "'"],
];

/** Tout ce qui peut ouvrir une citation, pour la détection de forme. */
const OPENING = /^[«\u201c\u2039"']/;

/**
 * Retire UNE paire de guillemets englobants — et seulement si elle englobe
 * vraiment : « Roueil » perd les siens, «Roueil» : mot incertain… garde les
 * siens (son guillemet fermant est au milieu, pas à la fin).
 */
export function stripOuterQuotes(text: string): string {
  let t = text.trim();
  for (let pass = 0; pass < 4; pass++) {
    const pair = QUOTE_PAIRS.find(
      ([open, close]) =>
        t.length > open.length + close.length &&
        t.startsWith(open) &&
        t.endsWith(close) &&
        !t.slice(open.length, -close.length).includes(close),
    );
    if (!pair) return t;
    t = t.slice(pair[0].length, -pair[1].length).trim();
  }
  return t;
}

/**
 * Toutes les citations d'un texte, dans l'ordre, dépouillées et non vides. `end`
 * porte l'index de fin de la citation GUILLEMET COMPRIS : c'est là que reprend
 * la glose, et l'oublier laissait un « » : » orphelin en tête du contexte.
 */
function quotedSegments(text: string): { text: string; end: number }[] {
  const out: { text: string; end: number }[] = [];
  const re = /[«\u201c\u2039"]\s*([^»\u201d\u203a"]+?)\s*[»\u201d\u203a"]/g;
  for (const m of text.matchAll(re)) {
    const seg = m[1].trim();
    if (seg) out.push({ text: seg, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Est-ce une phrase explicative plutôt qu'un mot lu ? Trois signes suffisent, et
 * aucun ne se rencontre sur un mot recopié d'un carnet : la longueur, le
 * deux-points d'énoncé, et le guillemet ouvrant en tête (le mot est cité DANS
 * la phrase, il n'EST pas la phrase).
 */
function looksLikeNote(text: string): boolean {
  return text.length > MAX_TOKEN || /\s:\s|^\S+\s*:\s/.test(text) || OPENING.test(text);
}

/** Enlève ce qui reste du séparateur quand on a détaché le mot de sa glose. */
function tidyNote(note: string): string {
  return note.replace(/^[\s:,;.–—-]+/, "").replace(/[\s:,;–—-]+$/, "").trim();
}

/**
 * Les tournures par lesquelles une glose ANNONCE une autre lecture. Sans ce
 * garde-fou, toute citation de la glose devenait une suggestion — et
 * « mot incertain après «Nounour» » proposait de lire « Nounour » à la place du
 * mot douteux, alors que la phrase ne fait que dire OÙ il se trouve. Une
 * suggestion fausse est pire que pas de suggestion : c'est le seul endroit du
 * produit où l'on demande à un parent de faire confiance à la machine.
 */
const PROPOSES =
  /(peut[- ]être|probablement|sans doute|plut[oô]t|vraisemblablement|il s'agit|lire)\s*(de|d'|:)?\s*$/i;

/** Deux textes qui ne diffèrent que par la casse ou la ponctuation de bord. */
function sameish(a: string, b: string): boolean {
  const k = (s: string) => stripOuterQuotes(s).toLowerCase().replace(/[.,;:!?]+$/, "");
  return k(a) === k(b);
}

/**
 * Les lectures alternatives citées DANS la glose, et elles seules : une citation
 * ne devient une suggestion que si ce qui la précède l'annonce comme telle
 * (« probablement «flûte» », « peut-être «éveillée» »). Une citation qui sert de
 * repère (« après «Nounour» ») est laissée où elle est, dans le contexte.
 */
function harvestSuggestions(note: string, token: string): string[] {
  const out: string[] = [];
  for (const q of quotedSegments(note)) {
    const before = note.slice(0, q.end - 1).replace(/[«\u201c\u2039"][^«\u201c\u2039"]*$/, "");
    if (!PROPOSES.test(before)) continue;
    if (q.text.length > MAX_TOKEN || sameish(q.text, token)) continue;
    if (out.some((o) => sameish(o, q.text))) continue;
    out.push(q.text);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Remet une incertitude dans son contrat : un mot dans `original`, l'explication
 * dans `contexte`, les lectures alternatives dans `suggestions`.
 *
 * Quand le modèle a tout écrit dans `original`, les lectures alternatives sont
 * souvent DANS la phrase (« «écrite» : peut-être «éveillée» ou autre mot ») : on
 * les récupère, mais seulement si le modèle n'en a proposé aucune — une
 * suggestion inventée ici ne doit jamais primer sur une suggestion donnée.
 */
export function tidyUncertainty<T extends Uncertainty>(u: T): T {
  const raw = (u.original ?? "").trim();
  if (!raw) return u;

  const bare = stripOuterQuotes(raw);
  if (!bare) return u;
  if (!looksLikeNote(bare)) {
    // Déjà un mot : on ne garde que le dépouillement des guillemets.
    return bare === u.original ? u : { ...u, original: bare };
  }

  const quoted = quotedSegments(bare);
  let token = "";
  let note = "";

  if (quoted.length && quoted[0].text.length <= MAX_TOKEN) {
    // « X » : glose — le premier segment cité est le mot lu.
    token = quoted[0].text;
    note = tidyNote(bare.slice(quoted[0].end));
  } else {
    // X : glose — sans citation, le deux-points fait la coupe.
    const cut = bare.search(/\s*:\s/);
    if (cut <= 0) return bare === u.original ? u : { ...u, original: bare };
    const head = stripOuterQuotes(bare.slice(0, cut));
    if (!head || head.length > MAX_TOKEN) return u;
    token = head;
    note = tidyNote(bare.slice(cut));
  }

  const given = (u.suggestions ?? []).filter(
    (s) => typeof s === "string" && s.trim(),
  );
  const harvested = given.length ? given : harvestSuggestions(note, token);

  // Le contexte donné par le modèle prime ; la glose ne le remplace que s'il
  // est vide (ou s'il ne fait que répéter ce qu'on vient d'extraire).
  const existing = (u.contexte ?? "").trim();
  const contexte = existing && !sameish(existing, raw) ? existing : note;

  return { ...u, original: token, contexte, suggestions: harvested };
}

/**
 * Tolère aussi les vieilles entrées où `uncertainties` était un simple tableau
 * de chaînes, et les lignes JSONB dont on ne sait rien.
 */
export function tidyUncertainties(raw: unknown): Uncertainty[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((u) =>
      typeof u === "string"
        ? {
            original: u,
            contexte: "",
            suggestions: [] as string[],
            champ: null as UncertaintyField | null,
            resolved: null as string | null,
          }
        : (u as Uncertainty),
    )
    .filter((u) => u && typeof u.original === "string" && u.original.trim())
    .map(tidyUncertainty);
}
