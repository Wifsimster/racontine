import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineScope } from "./visibility.js";

/* La règle de visibilité du journal — la même pour la timeline web et pour les
   outils MCP, qui en portaient jusqu'ici chacun leur copie. */

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
