import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeLogger } from "../testing/fakes.js";
import type { PushPayload } from "../push.js";
import {
  CaptureReminderScheduler,
  type CaptureReminderStore,
  type ReminderCandidate,
  type ReminderPush,
} from "./capture-reminders.js";

class MemoryStore implements CaptureReminderStore {
  asked: string[] = [];
  constructor(public rows: ReminderCandidate[]) {}
  async candidates(day: string) {
    this.asked.push(day);
    return this.rows.map((r) => ({ ...r }));
  }
  async claim(userId: string, childId: string, day: string) {
    const row = this.rows.find((r) => r.userId === userId && r.childId === childId);
    if (!row || (row.lastSentOn !== null && row.lastSentOn >= day)) return false;
    row.lastSentOn = day;
    return true;
  }
}

class SpyPush implements ReminderPush {
  sent: { userId: string; payload: PushPayload }[] = [];
  constructor(private enabled = true, private fail = false) {}
  isEnabled() {
    return this.enabled;
  }
  async send(userId: string, payload: PushPayload) {
    if (this.fail) throw new Error("boom");
    this.sent.push({ userId, payload });
  }
}

function candidate(over: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    userId: "u-maman",
    childId: "c-leon",
    childName: "Léon",
    time: "18:30",
    days: [1, 2, 3, 4, 5],
    lastSentOn: null,
    hasEntryToday: false,
    hasPush: true,
    ...over,
  };
}

const DUE = new Date("2026-11-04T17:31:00Z");

function build(rows: ReminderCandidate[], push = new SpyPush()) {
  const store = new MemoryStore(rows);
  const logger = new FakeLogger();
  const scheduler = new CaptureReminderScheduler({
    store,
    push,
    webBaseUrl: "https://racontine.test",
    logger,
    timeZone: "Europe/Paris",
  });
  return { store, push, logger, scheduler };
}

test("envoie un seul rappel par jour même sur plusieurs cycles", async () => {
  const { store, push, scheduler } = build([candidate()]);
  assert.equal(await scheduler.tick(DUE), 1);
  assert.equal(await scheduler.tick(new Date(DUE.getTime() + 60_000)), 0);
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].payload.title, "Le carnet de Léon d'aujourd'hui ?");
  assert.equal(push.sent[0].payload.url, "https://racontine.test/capture?childId=c-leon");
  assert.equal(store.rows[0].lastSentOn, "2026-11-04");
  assert.deepEqual(store.asked, ["2026-11-04", "2026-11-04"]);
});

test("un redémarrage (nouveau planificateur) ne renvoie pas le rappel", async () => {
  const first = build([candidate()]);
  await first.scheduler.tick(DUE);
  const again = build(first.store.rows, first.push);
  assert.equal(await again.scheduler.tick(new Date(DUE.getTime() + 5 * 60_000)), 0);
  assert.equal(first.push.sent.length, 1);
});

test("journée déjà là ou pas d'abonnement push : rien n'est réservé", async () => {
  const { store, push, scheduler } = build([
    candidate({ hasEntryToday: true }),
    candidate({ userId: "u-papa", hasPush: false }),
  ]);
  assert.equal(await scheduler.tick(DUE), 0);
  assert.equal(push.sent.length, 0);
  assert.deepEqual(
    store.rows.map((r) => r.lastSentOn),
    [null, null],
  );
});

test("push non configuré sur le serveur : aucune lecture", async () => {
  const { store, scheduler } = build([candidate()], new SpyPush(false));
  assert.equal(await scheduler.tick(DUE), 0);
  assert.deepEqual(store.asked, []);
});

test("chaque gestionnaire et chaque enfant ont leur rappel", async () => {
  const { push, scheduler } = build([
    candidate(),
    candidate({ userId: "u-papa" }),
    candidate({ childId: "c-anna", childName: "Anna" }),
  ]);
  assert.equal(await scheduler.tick(DUE), 3);
  assert.deepEqual(
    push.sent.map((s) => `${s.userId}:${s.payload.tag}`),
    ["u-maman:rappel-c-leon", "u-papa:rappel-c-leon", "u-maman:rappel-c-anna"],
  );
});

test("un échec d'envoi est journalisé sans retenter", async () => {
  const { store, logger, scheduler } = build([candidate()], new SpyPush(true, true));
  assert.equal(await scheduler.tick(DUE), 0);
  assert.equal(store.rows[0].lastSentOn, "2026-11-04");
  assert.deepEqual(logger.errors, ["Rappel de capture non envoyé"]);
});
