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

test("seuls les services de push des navigateurs sont des endpoints acceptés", async () => {
  const { isPushServiceEndpoint } = await import("./push.js");
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/abc",
  ])
    assert.equal(isPushServiceEndpoint(ok), true, ok);
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://169.254.169.254/latest/meta-data",
    "http://server:3010/api/admin",
    "https://fcm.googleapis.com.evil.test/x",
    "https://fcm.googleapis.com:8443/x",
    "pas une url",
  ])
    assert.equal(isPushServiceEndpoint(bad), false, bad);
});
