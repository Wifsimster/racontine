import { test } from "node:test";
import assert from "node:assert/strict";
import { webPushEnabled, vapidPublicKey, sendPushToUser } from "./push.js";

// Les tests tournent sans VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY dans l'env : le
// push doit se désactiver proprement plutôt que de planter.

test("webPushEnabled est faux sans clés VAPID", () => {
  assert.equal(webPushEnabled(), false);
});

test("vapidPublicKey est null sans clés VAPID", () => {
  assert.equal(vapidPublicKey(), null);
});

test("sendPushToUser ne fait rien (et ne touche pas la base) quand désactivé", async () => {
  // Ne doit pas lever ni interroger la base : un retour anticipé sur
  // `webPushEnabled() === false` avant toute requête. Si ça touchait la base,
  // le test échouerait (pas de connexion configurée en unité).
  await assert.doesNotReject(() =>
    sendPushToUser("user-inexistant", { title: "x", body: "y" }),
  );
});
