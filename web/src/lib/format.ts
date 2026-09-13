/* ===========================================================================
   LA TYPOGRAPHIE ET LES DATES, EN UN SEUL ENDROIT.

   Ces fonctions étaient recopiées d'un écran à l'autre : le journal avait sa
   version de « 2 h 05 », la relecture sa version de « mercredi 11 mars ». Deux
   écrans d'une même app ne peuvent pas écrire une durée de deux façons.
   =========================================================================== */

/** Espace insécable : « 2 h 05 », « 12 h 45 » — typographie française. */
export const NBSP = " ";

/**
 * Le texte TRANSCRIT passe par la même typographie que la copie de l'app.
 *
 * Le journal est un objet composé : sur une même page, « aujourd'hui » écrit par
 * l'app et « c'est mieux dépareillées » sorti du modèle ne peuvent pas porter
 * deux apostrophes différentes — l'une courbe, l'autre une quille de machine à
 * écrire. La transformation est volontairement minuscule et sans perte : une
 * apostrophe droite ENTRE DEUX LETTRES devient l'apostrophe française. Rien
 * d'autre n'est touché (ni les guillemets, ni les points de suspension, ni les
 * chiffres) et la donnée stockée, elle, n'est jamais modifiée.
 */
export function fr(text: string): string {
  return text.replace(/(\p{L})['‘](\p{L})/gu, "$1’$2");
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

export function dayOf(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** Nombre de jours calendaires entre aujourd'hui et une date ISO. */
export function daysAgo(iso: string): number {
  const d = dayOf(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

/**
 * Le repère de date affiché sur la carte. « Aujourd'hui » / « Hier » d'abord :
 * c'est ainsi qu'un parent parle de la journée qu'il vient de vivre. Au-delà,
 * le jour de la semaine revient, parce qu'il situe mieux que le seul chiffre.
 */
export function dayLabel(iso: string): string {
  const n = daysAgo(iso);
  if (n === 0) return "aujourd’hui";
  if (n === 1) return "hier";
  if (n < 7) return fmtWeekdayDayMonth.format(dayOf(iso));
  return fmtDayMonth.format(dayOf(iso));
}

/** « 11 mars » — le repère court d'une journée. */
export function dayMonth(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtDayMonth.format(d);
}

/**
 * « 11 mars » en court — « 11 mars » devient « 11 mars », « 11 septembre »
 * devient « 11 sept ». La colonne de date du mode « parcourir » fait 64 px :
 * un mois écrit en toutes lettres y passe à la ligne et fait grandir la
 * rangée d'un tiers. Le point d'abréviation est retiré comme dans le stepper
 * de relecture — l'app abrège déjà les mois de cette façon.
 */
export function dayMonthShort(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    .replace(/\.$/, "");
}

/** « mercredi 11 mars » — le repère long d'une journée. */
export function longDate(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtWeekdayDayMonth.format(d);
}

/** « mercredi 11 mars 2026 ». */
export function fullDate(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtFull.format(d);
}

/** « mars 2026 » — l'intertitre d'un mois de journal. */
export function monthYear(iso: string): string {
  const d = dayOf(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtMonthYear.format(d);
}

/** « 12h45 », « 12:45 », « 12 h » → minutes depuis minuit. */
export function parseTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatClock(s?: string | null): string | null {
  const t = parseTime(s);
  if (t === null) return null;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

/**
 * Le dernier jour d'un mois « AAAA-MM » — ce que vaut « emmène-moi en mars »
 * une fois traduit en bord de fenêtre pour le fil (`api.timeline({ from })`).
 * Même calcul que `domain/feed-window.ts` côté serveur, en UTC pour qu'un
 * parent à Nouméa et un autre à Brest demandent exactement la même page.
 */
export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

/** « mercredi 11 mars » -> « Mercredi 11 mars » (et pas « Mercredi 11 Mars »). */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
