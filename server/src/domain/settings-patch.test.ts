import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettingsPatch } from "./settings-patch.js";

test("un patch vide ne change rien (et n'est pas une erreur)", () => {
  const r = parseSettingsPatch({});
  assert.ok(r.ok);
  assert.deepEqual(r.patch, {});
});

test("le nom de l'instance est nettoyé, la chaîne vide remet au défaut", () => {
  const trimmed = parseSettingsPatch({ appName: "  Le carnet de Lou  " });
  assert.ok(trimmed.ok);
  assert.equal(trimmed.patch.appName, "Le carnet de Lou");

  for (const reset of [{ appName: "" }, { appName: null }]) {
    const r = parseSettingsPatch(reset);
    assert.ok(r.ok);
    assert.equal(r.patch.appName, null);
  }
});

test("un nom de plus de 60 caractères est refusé, en français", () => {
  const r = parseSettingsPatch({ appName: "x".repeat(61) });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.includes("1 à 60 caractères"));
});

test("les interrupteurs n'acceptent que des booléens", () => {
  assert.equal(parseSettingsPatch({ signupEnabled: "oui" }).ok, false);
  assert.equal(parseSettingsPatch({ emailNotificationsEnabled: 1 }).ok, false);

  const r = parseSettingsPatch({
    signupEnabled: false,
    emailNotificationsEnabled: true,
  });
  assert.ok(r.ok);
  assert.deepEqual(r.patch, {
    signupEnabled: false,
    emailNotificationsEnabled: true,
  });
});

test("la validité d'une invitation tient entre 1 et 365 jours entiers", () => {
  for (const bad of [0, 366, 2.5, "sept"]) {
    const r = parseSettingsPatch({ invitationTtlDays: bad });
    assert.equal(r.ok, false, `${bad} aurait dû être refusé`);
  }
  const r = parseSettingsPatch({ invitationTtlDays: "14" });
  assert.ok(r.ok);
  assert.equal(r.patch.invitationTtlDays, 14);
});

test("le modèle VLM refuse le vide et l'invraisemblable", () => {
  assert.equal(parseSettingsPatch({ vlmModel: "   " }).ok, false);
  assert.equal(parseSettingsPatch({ vlmModel: "m".repeat(101) }).ok, false);

  const r = parseSettingsPatch({ vlmModel: " claude-opus-4-8 " });
  assert.ok(r.ok);
  assert.equal(r.patch.vlmModel, "claude-opus-4-8");
});

test("le premier champ invalide arrête tout — rien n'est appliqué à moitié", () => {
  const r = parseSettingsPatch({ signupEnabled: true, invitationTtlDays: 0 });
  assert.equal(r.ok, false);
});
