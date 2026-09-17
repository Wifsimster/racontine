import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirms,
  planAccountErasure,
  type CarnetStanding,
  type ErasureSnapshot,
} from "./erasure.js";

/* Les trois refus qui protègent les AUTRES du départ de quelqu'un, et la règle
   qui décide quels carnets s'en vont avec lui. Aucune base, aucun disque. */

function carnet(over: Partial<CarnetStanding> = {}): CarnetStanding {
  return {
    childId: "child-1",
    childName: "Lou",
    role: "admin",
    admins: 2,
    members: 3,
    ...over,
  };
}

function snapshot(over: Partial<ErasureSnapshot> = {}): ErasureSnapshot {
  return {
    isOwner: false,
    otherAccounts: 2,
    carnets: [],
    activeSubscription: false,
    ...over,
  };
}

test("un compte ordinaire s'efface, et quitte simplement les cercles partagés", () => {
  const plan = planAccountErasure(
    snapshot({ carnets: [carnet({ role: "reader", admins: 1, members: 4 })] }),
  );
  assert.equal(plan.ok, true);
  assert.ok(plan.ok);
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.leaves, [{ id: "child-1", name: "Lou" }]);
});

test("un carnet dont il est le SEUL membre part avec lui", () => {
  // Personne d'autre ne peut plus le lire ni l'effacer : le laisser derrière,
  // ce serait garder sur le disque le journal d'un enfant que plus aucun compte
  // n'atteint.
  const plan = planAccountErasure(
    snapshot({ carnets: [carnet({ admins: 1, members: 1 })] }),
  );
  assert.ok(plan.ok);
  assert.deepEqual(plan.deletes, [{ id: "child-1", name: "Lou" }]);
  assert.deepEqual(plan.leaves, []);
});

test("seul administrateur d'un carnet que d'autres suivent : refus, et le carnet est nommé", () => {
  const plan = planAccountErasure(
    snapshot({ carnets: [carnet({ admins: 1, members: 3 })] }),
  );
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.equal(plan.code, "sole_admin");
  assert.deepEqual(plan.carnets, [{ id: "child-1", name: "Lou" }]);
  // La phrase doit nommer l'enfant et dire quoi faire : « nommez un autre
  // administrateur » est la seule sortie que la personne peut actionner seule.
  assert.match(plan.error, /Lou/);
  assert.match(plan.error, /administrateur/);
});

test("un carnet qui garde un second administrateur ne bloque rien", () => {
  const plan = planAccountErasure(
    snapshot({ carnets: [carnet({ admins: 2, members: 3 })] }),
  );
  assert.ok(plan.ok);
  assert.deepEqual(plan.leaves, [{ id: "child-1", name: "Lou" }]);
});

test("plusieurs carnets orphelins sont tous nommés, pas seulement le premier", () => {
  const plan = planAccountErasure(
    snapshot({
      carnets: [
        carnet({ childId: "c1", childName: "Lou", admins: 1, members: 2 }),
        carnet({ childId: "c2", childName: "Anouk", admins: 1, members: 5 }),
      ],
    }),
  );
  assert.ok(!plan.ok);
  assert.equal(plan.carnets.length, 2);
  assert.match(plan.error, /Lou/);
  assert.match(plan.error, /Anouk/);
});

test("le propriétaire de l'instance ne part pas tant que d'autres comptes existent", () => {
  // Sinon le compte le plus ancien restant hériterait de l'instance — réglages,
  // inscriptions, caisse — sans que personne l'ait décidé ni vu.
  const plan = planAccountErasure(
    snapshot({ isOwner: true, otherAccounts: 1 }),
  );
  assert.ok(!plan.ok);
  assert.equal(plan.code, "instance_owner");
});

test("le propriétaire DERNIER compte de l'instance, lui, peut partir", () => {
  const plan = planAccountErasure(
    snapshot({
      isOwner: true,
      otherAccounts: 0,
      carnets: [carnet({ admins: 1, members: 1 })],
    }),
  );
  assert.ok(plan.ok);
  assert.deepEqual(plan.deletes, [{ id: "child-1", name: "Lou" }]);
});

test("un abonnement encore actif retient le propriétaire, et lui dit où résilier", () => {
  const plan = planAccountErasure(
    snapshot({ isOwner: true, otherAccounts: 0, activeSubscription: true }),
  );
  assert.ok(!plan.ok);
  assert.equal(plan.code, "subscription_active");
  assert.match(plan.error, /Abonnement|résilie/i);
});

test("l'abonnement du foyer ne retient PAS un proche qui n'en est pas le payeur", () => {
  // Le péage est celui de l'instance, porté par son propriétaire. Une
  // grand-mère lectrice n'a rien à résilier, et ne doit pas être bloquée par la
  // carte de quelqu'un d'autre.
  const plan = planAccountErasure(
    snapshot({ isOwner: false, activeSubscription: true }),
  );
  assert.ok(plan.ok);
});

test("l'argent d'abord : abonnement actif ET propriété se disent dans cet ordre", () => {
  const plan = planAccountErasure(
    snapshot({ isOwner: true, otherAccounts: 3, activeSubscription: true }),
  );
  assert.ok(!plan.ok);
  assert.equal(plan.code, "subscription_active");
});

/* ------------------------- La phrase à recopier -------------------------- */

test("la confirmation tolère espaces, casse et accents", () => {
  assert.equal(confirms("  Léa ", "Léa"), true);
  assert.equal(confirms("lea", "Léa"), true);
  assert.equal(confirms("LÉA", "Léa"), true);
  assert.equal(confirms("MAMIE@exemple.FR", "mamie@exemple.fr"), true);
});

test("la confirmation refuse un autre mot — c'est tout ce qu'on lui demande", () => {
  assert.equal(confirms("Lou", "Léa"), false);
  assert.equal(confirms("", "Léa"), false);
  assert.equal(confirms("Lé", "Léa"), false);
});

test("une attente vide ne se confirme jamais toute seule", () => {
  // Un nom manquant en base ne doit pas rendre l'effacement confirmable par une
  // chaîne vide : le geste sans retour exigerait alors… rien du tout.
  assert.equal(confirms("", ""), false);
  assert.equal(confirms("   ", "  "), false);
});
