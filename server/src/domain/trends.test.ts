import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTrends,
  groupByMonth,
  mondayOf,
  normalizeAppetite,
  parsePeriod,
  parseYear,
  periodRange,
  type TrendDay,
} from "./trends.js";

test("les mentions d'appétit du carnet tombent dans six cases", () => {
  const cas: [string, string | null][] = [
    ["tout mangé", "tout"],
    ["Tout mangé très vite", "tout"],
    ["bon appétit, tout mangé", "tout"],
    ["trop fatiguée d'abord, puis termine tout", "tout"],
    ["mange tout son plat en jouant", "tout"],
    ["avale tout le couscous", "tout"],
    ["mange toute la purée + ½ compote", "tout"],
    ["bon appétit", "bien"],
    ["très bon appétit", "bien"],
    ["mange bien", "bien"],
    ["se régale de la banane", "bien"],
    ["presque tout", "bien"],
    ["partiel", "partie"],
    ["3/4 du plat", "partie"],
    ["moitié de l'assiette", "partie"],
    ["moitié du plat, laitage entier, compote 1/2", "partie"],
    ["en laisse un peu (rhume)", "partie"],
    ["un peu de mal avec la purée", "partie"],
    ["le plat ne lui plaît pas trop", "partie"],
    ["petit appétit", "peu"],
    ["peu", "peu"],
    ["30 ml seulement", "peu"],
    ["triture le biscuit sans trop le manger", "peu"],
    ["refusé", "refus"],
    ["refuse la cuillère", "refus"],
    ["vomit tout, refuse une nouvelle tentative", "refus"],
    ["n'a pas mangé", "refus"],
    ["mange toute seule", "autre"],
    ["gère la gourde presque toute seule", "autre"],
    ["", null],
    ["   ", null],
  ];
  for (const [mention, attendu] of cas)
    assert.equal(normalizeAppetite(mention), attendu, mention);
  assert.equal(normalizeAppetite(undefined), null);
});

test("la période vaut 4 semaines par défaut et part d'un lundi", () => {
  assert.equal(parsePeriod("12m"), "12m");
  assert.equal(parsePeriod("n'importe"), "4s");
  assert.equal(parsePeriod(undefined), "4s");
  assert.equal(mondayOf("2026-11-04"), "2026-11-02");
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
  assert.deepEqual(periodRange("4s", "2026-11-04"), {
    from: "2026-10-12",
    to: "2026-11-04",
  });
  assert.equal(periodRange("3m", "2026-11-04").from, "2026-08-10");
  assert.equal(periodRange("12m", "2026-11-04").from, "2025-11-10");
});

const jour = (date: string, items: TrendDay["items"]): TrendDay => ({
  date,
  items,
});
const sieste = (debut: string, fin: string) => ({
  type: "nap" as const,
  data: { debut, fin },
});
const repas = (appetit?: string) => ({
  type: "meal" as const,
  data: { moment: "midi", contenu: "purée", appetit },
});
const activite = (label: string) => ({
  type: "activity" as const,
  data: { label },
});

test("la sieste moyenne d'une semaine est la moyenne des jours mesurés", () => {
  const t = buildTrends(
    [
      jour("2026-10-12", [sieste("13h", "15h"), sieste("9H20", "9H50")]),
      jour("2026-10-13", [sieste("13h", "14h")]),
      jour("2026-10-14", [sieste("13h", "")]),
      jour("2026-10-27", [sieste("12h30", "14h")]),
    ],
    { from: "2026-10-12", to: "2026-11-04" },
  );
  assert.deepEqual(
    t.naps.weeks.map((w) => [w.weekStart, w.averageMinutes, w.days]),
    [
      ["2026-10-12", 105, 2],
      ["2026-10-19", null, 0],
      ["2026-10-26", 90, 1],
      ["2026-11-02", null, 0],
    ],
  );
  assert.equal(t.naps.averageMinutes, 100);
  assert.equal(t.naps.days, 3);
  assert.equal(t.days, 4);
});

test("les jours hors période ne comptent pas", () => {
  const t = buildTrends(
    [jour("2026-01-01", [sieste("13h", "15h")])],
    { from: "2026-10-12", to: "2026-11-04" },
  );
  assert.equal(t.days, 0);
  assert.equal(t.naps.averageMinutes, null);
});

test("l'appétit se compte par case, les repas muets à part", () => {
  const t = buildTrends(
    [jour("2026-10-12", [repas("tout mangé"), repas("Tout mangé"), repas("peu"), repas()])],
    { from: "2026-10-12", to: "2026-10-18" },
  );
  const compte = Object.fromEntries(t.appetite.levels.map((l) => [l.level, l.count]));
  assert.equal(compte.tout, 2);
  assert.equal(compte.peu, 1);
  assert.equal(compte.refus, 0);
  assert.equal(t.appetite.unspecified, 1);
  assert.deepEqual(
    t.appetite.levels.map((l) => l.label),
    ["Tout mangé", "Bien mangé", "En partie", "Peu", "Refusé", "Autre remarque"],
  );
});

test("les activités se regroupent malgré la casse et se limitent au top", () => {
  const items = [
    activite("Pâte à sel"),
    activite("pâte à sel"),
    activite("pâte à sel."),
    activite("Parc"),
    activite("Parc"),
    activite("Lecture"),
  ];
  const t = buildTrends([jour("2026-10-12", items)], {
    from: "2026-10-12",
    to: "2026-10-18",
  }, { topActivities: 2 });
  assert.deepEqual(t.activities, [
    { label: "Pâte à sel", count: 3 },
    { label: "Parc", count: 2 },
  ]);
});

test("santé chronologique, anecdotes de la plus récente à la plus ancienne", () => {
  const t = buildTrends(
    [
      jour("2026-10-20", [
        { type: "health", data: { note: "Doliprane 15h" } },
        { type: "anecdote", data: { text: "B" } },
      ]),
      jour("2026-10-13", [
        { type: "health", data: { note: "Nez qui coule" } },
        { type: "anecdote", data: { text: "A" } },
      ]),
    ],
    { from: "2026-10-12", to: "2026-11-04" },
  );
  assert.deepEqual(t.health, [
    { date: "2026-10-13", note: "Nez qui coule" },
    { date: "2026-10-20", note: "Doliprane 15h" },
  ]);
  assert.deepEqual(t.anecdotes.map((a) => a.text), ["B", "A"]);
});

test("l'année du livre se lit dans l'URL ou retombe sur l'année courante", () => {
  assert.equal(parseYear("2025", 2026), 2025);
  assert.equal(parseYear("20x5", 2026), 2026);
  assert.equal(parseYear(undefined, 2026), 2026);
  assert.equal(parseYear("1850", 2026), 2026);
});

test("le livre range les journées par mois, dans l'ordre", () => {
  const g = groupByMonth([
    { date: "2026-02-03" },
    { date: "2026-01-10" },
    { date: "2026-01-02" },
  ]);
  assert.deepEqual(
    g.map((m) => [m.month, m.days.map((d) => d.date)]),
    [
      ["2026-01", ["2026-01-02", "2026-01-10"]],
      ["2026-02", ["2026-02-03"]],
    ],
  );
});
