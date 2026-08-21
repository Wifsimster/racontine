import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { deliverLink } from "./notify.js";

// Les tests tournent sans SMTP_HOST ni NOTIFY_WEBHOOK_URL dans l'env : aucun
// canal de livraison n'est configuré. C'est justement le cas qui décide si
// l'URL — qui est un identifiant de connexion — finit dans les logs ou non.

const URL_SENSIBLE =
  "https://racontine.test/api/auth/magic-link/verify?token=secret-de-connexion";

/** Exécute `fn` en capturant tout ce qui passe par console.log/console.error. */
async function captureConsole(fn: () => Promise<void>): Promise<string> {
  const { log, error } = console;
  const lignes: string[] = [];
  const collecte = (...args: unknown[]) => void lignes.push(args.join(" "));
  console.log = collecte;
  console.error = collecte;
  try {
    await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
  return lignes.join("\n");
}

const nodeEnvInitial = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = nodeEnvInitial;
});

test("en production, l'URL n'est jamais écrite dans les logs", async () => {
  process.env.NODE_ENV = "production";
  const sortie = await captureConsole(() =>
    deliverLink("proche@example.test", "Votre lien", URL_SENSIBLE),
  );
  assert.equal(
    sortie.includes(URL_SENSIBLE),
    false,
    "le lien de capacité a fuité sur la sortie standard",
  );
  assert.equal(
    sortie.includes("secret-de-connexion"),
    false,
    "le jeton a fuité sur la sortie standard",
  );
});

test("en production sans canal, l'échec de livraison est signalé bruyamment", async () => {
  process.env.NODE_ENV = "production";
  const sortie = await captureConsole(() =>
    deliverLink("proche@example.test", "Votre lien", URL_SENSIBLE),
  );
  // Un lien non livré doit être un incident visible, pas un silence.
  assert.match(sortie, /AUCUN CANAL DE LIVRAISON/);
  assert.match(sortie, /SMTP_HOST/);
  assert.match(sortie, /proche@example\.test/);
});

test("en développement, l'URL reste affichée pour pouvoir se connecter", async () => {
  process.env.NODE_ENV = "development";
  const sortie = await captureConsole(() =>
    deliverLink("dev@example.test", "Votre lien", URL_SENSIBLE),
  );
  assert.equal(sortie.includes(URL_SENSIBLE), true);
});

test("deliverLink ne lève jamais, même sans aucun canal configuré", async () => {
  process.env.NODE_ENV = "production";
  await captureConsole(async () => {
    await assert.doesNotReject(() =>
      deliverLink("proche@example.test", "Votre lien", URL_SENSIBLE),
    );
  });
});
