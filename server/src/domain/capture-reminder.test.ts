import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideReminder,
  isReminderTime,
  localDay,
  localInstant,
  normalizeReminderDays,
  reminderMessage,
  type ReminderSituation,
} from "./capture-reminder.js";

const TZ = "Europe/Paris";

function situation(over: Partial<ReminderSituation> = {}): ReminderSituation {
  return {
    enabled: true,
    time: "18:30",
    days: [1, 2, 3, 4, 5],
    lastSentOn: null,
    hasEntryOn: () => false,
    hasPush: true,
    ...over,
  };
}

test("mercredi 4 novembre 18:30 Paris (UTC+1) : envoi", () => {
  const d = decideReminder(situation(), new Date("2026-11-04T17:30:00Z"), TZ);
  assert.equal(d.send, true);
  assert.equal(d.day, "2026-11-04");
  if (d.send) assert.equal(d.dueAt.toISOString(), "2026-11-04T17:30:00.000Z");
});

test("une minute avant l'heure : trop tôt", () => {
  const d = decideReminder(situation(), new Date("2026-11-04T17:29:00Z"), TZ);
  assert.deepEqual(d, { send: false, reason: "too-early", day: "2026-11-04" });
});

test("heure d'été : 18:30 à Paris = 16:30 UTC en juin", () => {
  const early = decideReminder(situation(), new Date("2026-06-10T16:29:00Z"), TZ);
  assert.equal(early.send, false);
  const due = decideReminder(situation(), new Date("2026-06-10T16:30:00Z"), TZ);
  assert.equal(due.send, true);
});

test("jour du passage à l'heure d'été et d'hiver : l'heure locale tient", () => {
  assert.equal(
    localInstant("2026-03-29", "18:30", TZ).toISOString(),
    "2026-03-29T16:30:00.000Z",
  );
  assert.equal(
    localInstant("2026-10-25", "18:30", TZ).toISOString(),
    "2026-10-25T17:30:00.000Z",
  );
});

test("fenêtre de rattrapage : 1 h 59 après oui, 2 h après non", () => {
  assert.equal(
    decideReminder(situation(), new Date("2026-11-04T19:29:00Z"), TZ).send,
    true,
  );
  const late = decideReminder(situation(), new Date("2026-11-04T19:30:00Z"), TZ);
  assert.deepEqual(late, { send: false, reason: "too-late", day: "2026-11-04" });
});

test("le samedi n'est pas un jour de rappel par défaut", () => {
  const d = decideReminder(situation(), new Date("2026-11-07T17:40:00Z"), TZ);
  assert.equal(d.send, false);
  if (!d.send) assert.equal(d.reason, "not-a-reminder-day");
  const sat = decideReminder(
    situation({ days: [6] }),
    new Date("2026-11-07T17:40:00Z"),
    TZ,
  );
  assert.equal(sat.send, true);
});

test("le jour est celui de Paris, pas celui d'UTC", () => {
  assert.deepEqual(localDay(new Date("2026-11-04T23:30:00Z"), TZ), {
    day: "2026-11-05",
    isoWeekday: 4,
  });
  const d = decideReminder(
    situation({ time: "00:15" }),
    new Date("2026-11-04T23:30:00Z"),
    TZ,
  );
  assert.equal(d.send, true);
  assert.equal(d.day, "2026-11-05");
});

test("déjà envoyé aujourd'hui : pas de second rappel", () => {
  const d = decideReminder(
    situation({ lastSentOn: "2026-11-04" }),
    new Date("2026-11-04T17:45:00Z"),
    TZ,
  );
  assert.equal(d.send, false);
  if (!d.send) assert.equal(d.reason, "already-sent");
  const yesterday = decideReminder(
    situation({ lastSentOn: "2026-11-03" }),
    new Date("2026-11-04T17:45:00Z"),
    TZ,
  );
  assert.equal(yesterday.send, true);
});

test("une journée existe déjà pour aujourd'hui : rien", () => {
  const seen: string[] = [];
  const d = decideReminder(
    situation({
      hasEntryOn: (day) => {
        seen.push(day);
        return day === "2026-11-04";
      },
    }),
    new Date("2026-11-04T17:45:00Z"),
    TZ,
  );
  assert.equal(d.send, false);
  if (!d.send) assert.equal(d.reason, "entry-exists");
  assert.deepEqual(seen, ["2026-11-04"]);
});

test("sans abonnement push actif : rien", () => {
  const d = decideReminder(
    situation({ hasPush: false }),
    new Date("2026-11-04T17:45:00Z"),
    TZ,
  );
  assert.equal(d.send, false);
  if (!d.send) assert.equal(d.reason, "no-push");
});

test("désactivé ou heure invalide : rien", () => {
  const now = new Date("2026-11-04T17:45:00Z");
  for (const s of [situation({ enabled: false }), situation({ time: "25:00" })]) {
    const d = decideReminder(s, now, TZ);
    assert.equal(d.send, false);
    if (!d.send) assert.equal(d.reason, "disabled");
  }
});

test("validation de l'heure et des jours", () => {
  assert.equal(isReminderTime("07:05"), true);
  assert.equal(isReminderTime("7:05"), false);
  assert.equal(isReminderTime("24:00"), false);
  assert.deepEqual(normalizeReminderDays([5, 1, 1, 3]), [1, 3, 5]);
  assert.deepEqual(normalizeReminderDays([]), []);
  assert.equal(normalizeReminderDays([0]), null);
  assert.equal(normalizeReminderDays([1.5]), null);
  assert.equal(normalizeReminderDays("1"), null);
});

test("message : prénom et lien vers la capture avec l'enfant", () => {
  const m = reminderMessage("c-1", "Léon", "https://racontine.test");
  assert.equal(m.title, "Le carnet de Léon d'aujourd'hui ?");
  assert.equal(m.url, "https://racontine.test/capture?childId=c-1");
  assert.equal(m.tag, "rappel-c-1");
});
