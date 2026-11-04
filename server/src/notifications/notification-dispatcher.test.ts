import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FakeLogger,
  FakePendingNotifications,
  SpyChannel,
} from "../testing/fakes.js";
import { lastWeeklyDigestAt, planDispatch } from "./dispatch-plan.js";
import { NotificationDispatcher } from "./notification-dispatcher.js";
import type { PendingNotification, Recipient } from "./types.js";

const mamie: Recipient = {
  userId: "u-mamie",
  email: "mamie@example.test",
  name: "Mamie",
  emailEnabled: true,
};
const parrain: Recipient = {
  userId: "u-parrain",
  email: "parrain@example.test",
  name: "Parrain",
  emailEnabled: true,
};

const T0 = new Date("2026-11-04T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

let seq = 0;
function row(over: Partial<PendingNotification> & { day?: string } = {}): PendingNotification {
  const n = ++seq;
  const day = over.day ?? `2026-10-${String(n % 28 + 1).padStart(2, "0")}`;
  return {
    notificationId: `n-${n}`,
    createdAt: T0,
    recipient: mamie,
    cadence: "chaque",
    childId: "c-leon",
    childName: "Léon",
    entry: {
      entryId: `e-${n}`,
      date: day,
      title: `Journée ${n}`,
      highlight: `Temps fort ${n}`,
    },
    ...over,
  };
}

function build(store: FakePendingNotifications, channels: SpyChannel[]) {
  const logger = new FakeLogger();
  const dispatcher = new NotificationDispatcher({
    pending: store,
    channels,
    webBaseUrl: "https://racontine.test",
    logger,
  });
  return { dispatcher, logger };
}

test("une rafale de publications part en un seul message par destinataire et par carnet", async () => {
  const store = new FakePendingNotifications();
  for (let i = 0; i < 12; i++) store.add(row({ createdAt: at(i * 1000) }));
  store.add(row({ recipient: parrain, createdAt: at(0) }));
  store.add(row({ childId: "c-lou", childName: "Lou", createdAt: at(0) }));
  const email = new SpyChannel("email");
  const { dispatcher } = build(store, [email]);

  await dispatcher.tick(at(3 * MIN));

  assert.equal(email.sent.length, 3);
  const leon = email.sent.find(
    (s) => s.recipient.userId === "u-mamie" && s.message.childId === "c-leon",
  );
  assert.ok(leon);
  assert.equal(leon.message.title, "12 nouvelles journées de Léon");
  assert.equal(leon.message.entries.length, 12);
  assert.equal(leon.message.link, "https://racontine.test/");
  const solo = email.sent.find((s) => s.recipient.userId === "u-parrain");
  assert.equal(solo?.message.title, "Une nouvelle journée de Léon");
  assert.match(solo?.message.link ?? "", /\/entries\/e-/);
  assert.equal((await store.pending()).length, 0);
});

test("rien ne part tant que la rafale continue, tout part après le silence", async () => {
  const store = new FakePendingNotifications();
  store.add(row({ createdAt: at(0) }));
  store.add(row({ createdAt: at(90_000) }));
  const push = new SpyChannel("push");
  const { dispatcher } = build(store, [push]);

  await dispatcher.tick(at(2 * MIN));
  assert.equal(push.sent.length, 0);

  store.add(row({ createdAt: at(2 * MIN + 30_000) }));
  await dispatcher.tick(at(3 * MIN));
  assert.equal(push.sent.length, 0);

  await dispatcher.tick(at(5 * MIN));
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].message.entries.length, 3);
  assert.equal(push.sent[0].message.tag, "carnet-c-leon");
});

test("une publication qui n'en finit pas part quand même au bout de l'attente maximale", async () => {
  const store = new FakePendingNotifications();
  for (let i = 0; i <= 16; i++) store.add(row({ createdAt: at(i * MIN) }));
  const push = new SpyChannel("push");
  const { dispatcher } = build(store, [push]);

  await dispatcher.tick(at(16 * MIN));
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].message.entries.length, 17);
});

test("un redémarrage rattrape ce qui n'était pas parti, sans rien envoyer deux fois", async () => {
  const store = new FakePendingNotifications();
  store.add(row({ createdAt: at(0) }));
  store.add(row({ createdAt: at(10_000) }));
  const first = new SpyChannel("email");
  await build(store, [first]).dispatcher.tick(at(30_000));
  assert.equal(first.sent.length, 0);

  const afterRestart = new SpyChannel("email");
  const { dispatcher } = build(store, [afterRestart]);
  await dispatcher.tick(at(10 * MIN));
  await dispatcher.tick(at(11 * MIN));
  assert.equal(afterRestart.sent.length, 1);
  assert.equal(afterRestart.sent[0].message.entries.length, 2);
});

test("deux cycles simultanés ne doublent pas l'envoi", async () => {
  const store = new FakePendingNotifications();
  store.add(row({ createdAt: at(0) }));
  const email = new SpyChannel("email");
  const { dispatcher } = build(store, [email]);
  await Promise.all([dispatcher.tick(at(5 * MIN)), dispatcher.tick(at(5 * MIN))]);
  assert.equal(email.sent.length, 1);
});

test("la même journée notifiée deux fois n'est comptée qu'une fois", async () => {
  const store = new FakePendingNotifications();
  const a = row({ createdAt: at(0) });
  store.add(a);
  store.add({ ...a, notificationId: "n-doublon" });
  const email = new SpyChannel("email");
  const { dispatcher } = build(store, [email]);
  await dispatcher.tick(at(5 * MIN));
  assert.equal(email.sent[0].message.title, "Une nouvelle journée de Léon");
});

test("l'accusé de remise de l'e-mail horodate toutes les notifications du lot", async () => {
  const store = new FakePendingNotifications();
  store.add(row({ notificationId: "a", createdAt: at(0) }));
  store.add(row({ notificationId: "b", createdAt: at(0) }));
  const receipt = at(4 * MIN);
  const email = new SpyChannel("email", { receipt });
  const { dispatcher } = build(store, [email]);
  await dispatcher.tick(at(5 * MIN));
  assert.deepEqual(store.rows.get("a")?.emailedAt, receipt);
  assert.deepEqual(store.rows.get("b")?.emailedAt, receipt);
});

test("un canal en panne ou éteint n'empêche pas les autres", async () => {
  const store = new FakePendingNotifications();
  store.add(row({ createdAt: at(0) }));
  const broken = new SpyChannel("panne", { boom: true });
  const off = new SpyChannel("sms", { enabled: false });
  const push = new SpyChannel("push");
  const { dispatcher, logger } = build(store, [broken, off, push]);
  await dispatcher.tick(at(5 * MIN));
  assert.equal(push.sent.length, 1);
  assert.equal(off.sent.length, 0);
  assert.equal(logger.errors.length, 1);
});

test("un ancien abonné ou une journée dépubliée est écarté sans envoi", async () => {
  const store = new FakePendingNotifications();
  store.add(row({ notificationId: "parti", cadence: null, createdAt: at(0) }));
  store.add(row({ notificationId: "retirée", entry: null, createdAt: at(0) }));
  const email = new SpyChannel("email");
  const { dispatcher } = build(store, [email]);
  const report = await dispatcher.tick(at(30_000));
  assert.equal(report.discarded, 2);
  assert.equal(email.sent.length, 0);
  assert.equal((await store.pending()).length, 0);
});

test("en résumé hebdomadaire, rien ne part avant le dimanche soir", async () => {
  const store = new FakePendingNotifications();
  const wednesday = new Date("2026-11-04T10:00:00Z");
  store.add(row({ cadence: "hebdo", createdAt: wednesday }));
  store.add(row({ cadence: "hebdo", createdAt: new Date("2026-11-06T08:00:00Z") }));
  const email = new SpyChannel("email");
  const { dispatcher } = build(store, [email]);

  await dispatcher.tick(new Date("2026-11-08T17:59:00Z"));
  assert.equal(email.sent.length, 0);

  await dispatcher.tick(new Date("2026-11-08T18:00:30Z"));
  assert.equal(email.sent.length, 1);
  const digest = email.sent[0].message;
  assert.equal(digest.kind, "hebdo");
  assert.equal(digest.title, "La semaine de Léon : 2 journées");
  assert.equal(digest.entries[0].highlight?.startsWith("Temps fort"), true);
});

test("une publication du dimanche soir attend le résumé suivant", () => {
  const late = row({ cadence: "hebdo", createdAt: new Date("2026-11-08T18:30:00Z") });
  const plan = planDispatch([late], new Date("2026-11-08T19:00:00Z"));
  assert.equal(plan.batches.length, 0);
  const next = planDispatch([late], new Date("2026-11-15T18:01:00Z"));
  assert.equal(next.batches.length, 1);
});

test("un serveur éteint le dimanche soir rattrape le résumé le lundi", () => {
  const plan = planDispatch(
    [row({ cadence: "hebdo", createdAt: new Date("2026-11-05T09:00:00Z") })],
    new Date("2026-11-09T07:00:00Z"),
  );
  assert.equal(plan.batches.length, 1);
  assert.equal(plan.batches[0].kind, "hebdo");
});

test("le rendez-vous hebdomadaire suit l'heure de Paris, été comme hiver", () => {
  assert.equal(
    lastWeeklyDigestAt(new Date("2026-11-04T10:00:00Z")).toISOString(),
    "2026-11-01T18:00:00.000Z",
  );
  assert.equal(
    lastWeeklyDigestAt(new Date("2026-07-08T10:00:00Z")).toISOString(),
    "2026-07-05T17:00:00.000Z",
  );
  assert.equal(
    lastWeeklyDigestAt(new Date("2026-11-08T18:00:00Z")).toISOString(),
    "2026-11-08T18:00:00.000Z",
  );
  assert.equal(
    lastWeeklyDigestAt(new Date("2026-11-08T17:59:59Z")).toISOString(),
    "2026-11-01T18:00:00.000Z",
  );
});
