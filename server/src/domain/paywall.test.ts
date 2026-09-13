import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRIAL_DAYS,
  asSubscriptionStatus,
  carnetAccess,
  daysUntil,
  trialEndFrom,
  type PaywallInput,
} from "./paywall.js";

const NOW = new Date("2026-09-13T10:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function input(over: Partial<PaywallInput> = {}): PaywallInput {
  return {
    enabled: true,
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    now: NOW,
    ...over,
  };
}

test("sans Stripe configuré, une instance auto-hébergée n'a AUCUN péage", () => {
  // Le cas le plus important du fichier : le homelab de quelqu'un d'autre ne
  // doit jamais se retrouver enfermé parce qu'on a branché une caisse ailleurs.
  const access = carnetAccess(input({ enabled: false, trialEndsAt: days(-400) }));
  assert.equal(access.open, true);
  assert.equal(access.reason, "self-hosted");
});

test("l'essai gratuit ouvre le carnet et annonce les jours restants", () => {
  const access = carnetAccess(input({ trialEndsAt: days(9) }));
  assert.equal(access.open, true);
  assert.equal(access.reason, "trial");
  assert.equal(access.daysLeft, 9);
});

test("un essai qui finit dans trois heures reste ouvert, et compte un jour", () => {
  // Arrondi au supérieur : on n'écrit jamais « il reste 0 jour » à quelqu'un
  // qui peut encore photographier son carnet ce soir.
  const access = carnetAccess(input({ trialEndsAt: new Date(NOW.getTime() + 3 * 3_600_000) }));
  assert.equal(access.open, true);
  assert.equal(access.daysLeft, 1);
});

test("l'essai terminé ferme l'ajout de journées", () => {
  const access = carnetAccess(input({ trialEndsAt: days(-1) }));
  assert.equal(access.open, false);
  assert.equal(access.reason, "trial-over");
});

test("un abonnement actif ouvre le carnet, résiliation comprise jusqu'au terme", () => {
  const actif = carnetAccess(
    input({ status: "active", currentPeriodEnd: days(20) }),
  );
  assert.equal(actif.open, true);
  assert.equal(actif.reason, "subscribed");
  assert.equal(actif.endingAt, null);

  const resilie = carnetAccess(
    input({ status: "active", currentPeriodEnd: days(20), cancelAtPeriodEnd: true }),
  );
  assert.equal(resilie.open, true);
  assert.deepEqual(resilie.endingAt, days(20));
});

test("un prélèvement en échec NE ferme PAS le carnet — il le signale", () => {
  // Stripe relance une carte refusée pendant deux à trois semaines. Couper le
  // geste du soir au premier échec punirait une carte expirée, pas un fraudeur.
  const access = carnetAccess(
    input({ status: "past_due", currentPeriodEnd: days(-2) }),
  );
  assert.equal(access.open, true);
  assert.equal(access.reason, "payment-late");
});

test("une période déjà payée reste due, même résiliation prononcée", () => {
  const access = carnetAccess(
    input({ status: "canceled", currentPeriodEnd: days(11) }),
  );
  assert.equal(access.open, true);
  assert.equal(access.reason, "subscribed");
  assert.deepEqual(access.endingAt, days(11));
});

test("un abonnement résilié et consommé ferme, sans reparler d'essai", () => {
  const access = carnetAccess(
    input({ status: "canceled", currentPeriodEnd: days(-3), trialEndsAt: days(-200) }),
  );
  assert.equal(access.open, false);
  // « Votre essai est terminé » six mois après un vrai abonnement serait faux.
  assert.equal(access.reason, "subscription-over");
});

test("un abonnement jamais confirmé retombe sur l'essai s'il court encore", () => {
  const access = carnetAccess(
    input({ status: "incomplete", trialEndsAt: days(4) }),
  );
  assert.equal(access.open, true);
  assert.equal(access.reason, "trial");
  assert.equal(access.daysLeft, 4);
});

test("les statuts inconnus de Stripe ne sont jamais pris pour des statuts", () => {
  assert.equal(asSubscriptionStatus("active"), "active");
  assert.equal(asSubscriptionStatus("halte-au-feu"), null);
  assert.equal(asSubscriptionStatus(undefined), null);
});

test("l'essai dure bien quatorze jours à partir de l'ouverture du foyer", () => {
  assert.equal(TRIAL_DAYS, 14);
  assert.equal(daysUntil(trialEndFrom(NOW), NOW), 14);
  assert.equal(daysUntil(days(-5), NOW), 0);
});
