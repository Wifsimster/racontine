import assert from "node:assert/strict";
import { test } from "node:test";
import { sqlStateOf } from "./drizzle-entry-repository.js";

/* Drizzle enveloppe l'erreur du pilote : le SQLSTATE n'est pas sur l'erreur
   qu'on rattrape, mais sur sa cause. Le code appelant regardait `err.code`, qui
   vaut `undefined` sur l'enveloppe — une collision de journée rendait donc 500
   au lieu de 409, et une date impossible 500 au lieu de 400. */

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
