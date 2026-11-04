import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeLogger } from "../testing/fakes.js";
import { SubscriberNotifier } from "./subscriber-notifier.js";
import type {
  NotificationLog,
  PublicationEvent,
  Recipient,
  SubscriberDirectory,
} from "./types.js";

class FakeDirectory implements SubscriberDirectory {
  readonly asked: (string | null | undefined)[] = [];
  constructor(private readonly recipients: Recipient[]) {}
  async subscribersOf(
    _childId: string,
    excludeUserId?: string | null,
  ): Promise<Recipient[]> {
    this.asked.push(excludeUserId);
    return this.recipients;
  }
}

class FakeLog implements NotificationLog {
  readonly recorded: { userId: string; event: PublicationEvent }[] = [];
  constructor(private readonly failFor: string | null = null) {}
  async record(event: PublicationEvent, r: Recipient): Promise<string> {
    if (r.userId === this.failFor) throw new Error("base indisponible");
    this.recorded.push({ userId: r.userId, event });
    return `notif-${r.userId}`;
  }
}

const mamie: Recipient = {
  userId: "u-mamie",
  email: "mamie@example.test",
  name: "Mamie",
  emailEnabled: true,
};
const parrain: Recipient = {
  userId: "u-parrain",
  email: null,
  name: "Parrain",
  emailEnabled: false,
};

function build(recipients = [mamie, parrain], failFor: string | null = null) {
  const directory = new FakeDirectory(recipients);
  const log = new FakeLog(failFor);
  const logger = new FakeLogger();
  const notifier = new SubscriberNotifier({
    subscribers: directory,
    log,
    webBaseUrl: "https://racontine.test",
    logger,
  });
  return { notifier, directory, log, logger };
}

const publication = {
  entryId: "e1",
  childId: "c1",
  childName: "Lou",
  date: "2026-02-01",
  actorUserId: "u-parent",
};

test("chaque abonné reçoit sa notification in-app, une par journée", async () => {
  const { notifier, log } = build();
  await notifier.entryPublished(publication);
  assert.deepEqual(
    log.recorded.map((r) => r.userId),
    ["u-mamie", "u-parrain"],
  );
  assert.equal(log.recorded[0].event.link, "https://racontine.test/entries/e1");
  assert.match(log.recorded[0].event.title, /Lou/);
});

test("l'auteur de la publication est exclu de ses propres notifications", async () => {
  const { notifier, directory } = build();
  await notifier.entryPublished(publication);
  assert.deepEqual(directory.asked, ["u-parent"]);
});

test("sans abonné, rien n'est écrit", async () => {
  const { notifier, log } = build([]);
  await notifier.entryPublished(publication);
  assert.deepEqual(log.recorded, []);
});

test("un abonné en échec n'emporte pas les autres", async () => {
  const { notifier, log, logger } = build([mamie, parrain], "u-mamie");
  await notifier.entryPublished(publication);
  assert.deepEqual(
    log.recorded.map((r) => r.userId),
    ["u-parrain"],
  );
  assert.equal(logger.errors.length, 1);
});
