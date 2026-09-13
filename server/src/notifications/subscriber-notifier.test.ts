import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeLogger } from "../testing/fakes.js";
import { SubscriberNotifier } from "./subscriber-notifier.js";
import type {
  NotificationChannel,
  NotificationLog,
  PublicationEvent,
  Recipient,
  SubscriberDirectory,
} from "./types.js";

/* Un canal de notification s'ajoute sans toucher à l'orchestrateur : ces tests
   en branchent des inventés de toutes pièces. */

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
  readonly recorded: string[] = [];
  readonly delivered: { id: string; at: Date }[] = [];
  async record(_e: PublicationEvent, r: Recipient): Promise<string> {
    this.recorded.push(r.userId);
    return `notif-${r.userId}`;
  }
  async markDelivered(notificationId: string, at: Date): Promise<void> {
    this.delivered.push({ id: notificationId, at });
  }
}

class SpyChannel implements NotificationChannel {
  readonly sent: string[] = [];
  constructor(
    readonly name: string,
    private readonly enabled = true,
    private readonly receipt: Date | null = null,
    private readonly boom = false,
  ) {}
  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }
  async deliver(_e: PublicationEvent, r: Recipient): Promise<Date | null> {
    if (this.boom) throw new Error("canal en panne");
    this.sent.push(r.userId);
    return this.receipt;
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

function build(channels: NotificationChannel[], recipients = [mamie, parrain]) {
  const directory = new FakeDirectory(recipients);
  const log = new FakeLog();
  const logger = new FakeLogger();
  const notifier = new SubscriberNotifier({
    subscribers: directory,
    log,
    channels,
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

test("chaque abonné reçoit sa notification in-app, puis chaque canal actif", async () => {
  const push = new SpyChannel("push");
  const email = new SpyChannel("email");
  const { notifier, log } = build([push, email]);

  await notifier.entryPublished(publication);

  assert.deepEqual(log.recorded, ["u-mamie", "u-parrain"]);
  assert.deepEqual(push.sent, ["u-mamie", "u-parrain"]);
  assert.deepEqual(email.sent, ["u-mamie", "u-parrain"]);
});

test("un canal indisponible est simplement écarté", async () => {
  const off = new SpyChannel("sms", false);
  const on = new SpyChannel("push");
  const { notifier } = build([off, on]);

  await notifier.entryPublished(publication);

  assert.deepEqual(off.sent, []);
  assert.equal(on.sent.length, 2);
});

test("un canal en panne n'emporte ni les autres canaux ni les autres abonnés", async () => {
  const broken = new SpyChannel("panne", true, null, true);
  const healthy = new SpyChannel("push");
  const { notifier, log, logger } = build([broken, healthy]);

  await notifier.entryPublished(publication);

  assert.deepEqual(healthy.sent, ["u-mamie", "u-parrain"]);
  assert.deepEqual(log.recorded, ["u-mamie", "u-parrain"]);
  assert.equal(logger.errors.length, 2); // un par abonné
});

test("un canal qui rend un accusé de remise horodate la notification", async () => {
  const at = new Date("2026-02-01T10:00:00Z");
  const email = new SpyChannel("email", true, at);
  const { notifier, log } = build([email], [mamie]);

  await notifier.entryPublished(publication);

  assert.deepEqual(log.delivered, [{ id: "notif-u-mamie", at }]);
});

test("l'auteur de la publication est exclu de ses propres notifications", async () => {
  const { notifier, directory } = build([new SpyChannel("push")]);
  await notifier.entryPublished(publication);
  assert.deepEqual(directory.asked, ["u-parent"]);
});

test("sans abonné, rien n'est écrit nulle part", async () => {
  const push = new SpyChannel("push");
  const { notifier, log } = build([push], []);
  await notifier.entryPublished(publication);
  assert.deepEqual(log.recorded, []);
  assert.deepEqual(push.sent, []);
});
