import type { Uncertainty, UncertaintyField } from "./db/schema.js";

const MAX_TOKEN = 40;

const QUOTE_PAIRS: [string, string][] = [
  ["«", "»"],
  ["\u201c", "\u201d"],
  ["\u2039", "\u203a"],
  ['"', '"'],
  ["'", "'"],
];

const OPENING = /^[«\u201c\u2039"']/;

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

function quotedSegments(text: string): { text: string; end: number }[] {
  const out: { text: string; end: number }[] = [];
  const re = /[«\u201c\u2039"]\s*([^»\u201d\u203a"]+?)\s*[»\u201d\u203a"]/g;
  for (const m of text.matchAll(re)) {
    const seg = m[1].trim();
    if (seg) out.push({ text: seg, end: m.index + m[0].length });
  }
  return out;
}

function looksLikeNote(text: string): boolean {
  return text.length > MAX_TOKEN || /\s:\s|^\S+\s*:\s/.test(text) || OPENING.test(text);
}

function tidyNote(note: string): string {
  return note.replace(/^[\s:,;.–—-]+/, "").replace(/[\s:,;–—-]+$/, "").trim();
}

const PROPOSES =
  /(peut[- ]être|probablement|sans doute|plut[oô]t|vraisemblablement|il s'agit|lire)\s*(de|d'|:)?\s*$/i;

function sameish(a: string, b: string): boolean {
  const k = (s: string) => stripOuterQuotes(s).toLowerCase().replace(/[.,;:!?]+$/, "");
  return k(a) === k(b);
}

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

export function tidyUncertainty<T extends Uncertainty>(u: T): T {
  const raw = (u.original ?? "").trim();
  if (!raw) return u;

  const bare = stripOuterQuotes(raw);
  if (!bare) return u;
  if (!looksLikeNote(bare)) {
    return bare === u.original ? u : { ...u, original: bare };
  }

  const quoted = quotedSegments(bare);
  let token = "";
  let note = "";

  if (quoted.length && quoted[0].text.length <= MAX_TOKEN) {
    token = quoted[0].text;
    note = tidyNote(bare.slice(quoted[0].end));
  } else {
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

  const existing = (u.contexte ?? "").trim();
  const contexte = existing && !sameish(existing, raw) ? existing : note;

  return { ...u, original: token, contexte, suggestions: harvested };
}

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
