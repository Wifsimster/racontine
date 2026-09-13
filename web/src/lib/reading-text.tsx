import type { ReactNode } from "react";

/* ===========================================================================
   RETROUVER UN MOT DOUTEUX DANS UNE PAGE MANUSCRITE.

   Ces fonctions servaient l'écran de relecture et vivaient au milieu de lui,
   entre deux composants. Ce sont pourtant des règles de TEXTE pures, testables
   à part et réutilisables par tout écran qui montre une lecture incertaine.
   =========================================================================== */

/**
 * Le mot lu s'affiche partout entre guillemets français, posés par l'écran. Une
 * lecture qui arrive DÉJÀ citée — le modèle en met parfois, d'anciennes journées
 * en gardent — se retrouvait donc « « Roueil » » : deux paires de guillemets
 * pour un mot. Le serveur nettoie la donnée (server/src/uncertainties.ts) ; ceci
 * est le filet d'affichage, pour que l'écran ne double jamais la ponctuation
 * quoi qu'on lui serve.
 */
export function unquoted(text: string): string {
  let t = (text ?? "").trim();
  const pairs: [string, string][] = [
    ["«", "»"],
    ["“", "”"],
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
export function escapeRe(s: string): string {
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
export function wordMatcher(token: string): RegExp | null {
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
export function highlightToken(text: string, token: string): ReactNode {
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
  const out: ReactNode[] = [];
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
export function clipAround(phrase: string, token: string): string {
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
export function phraseAround(text: string, token: string): string | null {
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
