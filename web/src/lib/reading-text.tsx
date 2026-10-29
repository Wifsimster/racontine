import type { ReactNode } from "react";

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

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordMatcher(token: string): RegExp | null {
  const t = unquoted(token);
  if (!t) return null;
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t)}([^\\p{L}\\p{N}]|$)`, "iu");
  } catch {
    return null;
  }
}

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

const PHRASE_MAX = 150;

const PHRASE_BOUND = /[.!?;\n\r]/;

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
  const end =
    at +
    t.length +
    (stop ? stop.index + (stop[0] === "\n" || stop[0] === "\r" ? 0 : 1) : right.length);

  const phrase = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (!phrase || phrase.length <= t.length + 1) return null;
  return clipAround(phrase, t);
}
