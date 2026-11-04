import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reviewQueueChildIds,
  seesDrafts,
  timelineScope,
} from "./visibility.js";

test("la file « à vérifier » ne couvre que les carnets qu'on peut corriger", () => {
  const mems = [
    { childId: "c1", role: "reader" as const },
    { childId: "c2", role: "contributor" as const },
    { childId: "c3", role: "admin" as const },
  ];
  assert.deepEqual(reviewQueueChildIds(timelineScope(mems)), ["c2", "c3"]);
  assert.deepEqual(reviewQueueChildIds(timelineScope(mems, "c1")), []);
  assert.deepEqual(
    reviewQueueChildIds(timelineScope(mems, undefined, { asReader: true })),
    [],
  );
  assert.deepEqual(reviewQueueChildIds(timelineScope([])), []);
  assert.deepEqual(reviewQueueChildIds(timelineScope(mems, "c9")), []);
});

test("seuls contributeur et admin voient les journées non publiées", () => {
  assert.equal(seesDrafts("reader"), false);
  assert.equal(seesDrafts("contributor"), true);
  assert.equal(seesDrafts("admin"), true);
});

test("sans aucune adhésion, il n'y a rien à voir", () => {
  assert.deepEqual(timelineScope([]), { kind: "empty" });
});

test("un lecteur voit ses enfants, mais aucun brouillon", () => {
  const scope = timelineScope([{ childId: "c1", role: "reader" }]);
  assert.deepEqual(scope, {
    kind: "scoped",
    childIds: ["c1"],
    draftableChildIds: [],
  });
});

test("contributeur et admin voient aussi les brouillons", () => {
  const scope = timelineScope([
    { childId: "c1", role: "reader" },
    { childId: "c2", role: "contributor" },
    { childId: "c3", role: "admin" },
  ]);
  assert.equal(scope.kind, "scoped");
  if (scope.kind !== "scoped") return;
  assert.deepEqual(scope.childIds, ["c1", "c2", "c3"]);
  assert.deepEqual(scope.draftableChildIds, ["c2", "c3"]);
});

test("demander un enfant non partagé est refusé", () => {
  const scope = timelineScope([{ childId: "c1", role: "admin" }], "c9");
  assert.deepEqual(scope, { kind: "denied" });
});

test("demander un enfant partagé restreint la portée à lui seul", () => {
  const scope = timelineScope(
    [
      { childId: "c1", role: "admin" },
      { childId: "c2", role: "reader" },
    ],
    "c2",
  );
  assert.deepEqual(scope, {
    kind: "scoped",
    childIds: ["c2"],
    draftableChildIds: [],
  });
});

test("en vue lecteur, un admin ne voit plus ses brouillons", () => {
  const scope = timelineScope(
    [
      { childId: "c1", role: "admin" },
      { childId: "c2", role: "contributor" },
    ],
    undefined,
    { asReader: true },
  );
  assert.deepEqual(scope, {
    kind: "scoped",
    childIds: ["c1", "c2"],
    draftableChildIds: [],
  });
});
