import assert from "node:assert/strict";
import { test } from "node:test";
import { sqlStateOf } from "./drizzle-entry-repository.js";

test("le SQLSTATE est trouvé sur l'erreur elle-même", () => {
  assert.equal(sqlStateOf(Object.assign(new Error("dup"), { code: "23505" })), "23505");
});

test("le SQLSTATE est trouvé sous l'enveloppe de Drizzle", () => {
  const wrapped = new Error("Failed query", {
    cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
  });
  assert.equal(sqlStateOf(wrapped), "23505");
});

test("une erreur sans SQLSTATE ne se déguise pas en erreur métier", () => {
  assert.equal(sqlStateOf(new Error("réseau coupé")), "");
  assert.equal(sqlStateOf(null), "");
  assert.equal(sqlStateOf({ cause: { cause: {} } }), "");
});
