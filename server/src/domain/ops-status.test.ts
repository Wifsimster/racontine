import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessOps,
  STALLED_READING_AFTER_MS,
  type OpsCarnet,
  type StuckNote,
} from "./ops-status.js";

const NOW = new Date("2026-03-14T18:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const carnet = (over: Partial<OpsCarnet> = {}): OpsCarnet => ({
  id: "c1",
  name: "Lou",
  processing: 0,
  draft: 0,
  published: 12,
  failed: 0,
  lastPublishedAt: ago(86_400_000),
  ...over,
});

const stuck = (over: Partial<StuckNote> = {}): StuckNote => ({
  id: "e1",
  childId: "c1",
  child: "Lou",
  date: "2026-03-13",
  status: "failed",
  failureReason: "Votre clé API Anthropic est invalide ou révoquée.",
  since: ago(3_600_000),
  ...over,
});

test("une instance sans échec ni brouillon se porte bien", () => {
  const r = assessOps({ carnets: [carnet()], stuck: [], invitations: [], now: NOW });
  assert.equal(r.healthy, true);
  assert.equal(r.failedReadings.length, 0);
  assert.equal(r.drafts, 0);
  assert.match(r.summary, /Rien à signaler/);
});

test("une lecture en échec demande une intervention", () => {
  const r = assessOps({
    carnets: [carnet({ failed: 1 })],
    stuck: [stuck()],
    invitations: [],
    now: NOW,
  });
  assert.equal(r.healthy, false);
  assert.equal(r.failedReadings.length, 1);
  assert.equal(r.stalledReadings.length, 0);
  assert.match(r.summary, /À traiter : 1 lecture en échec\./);
});

test("une lecture en cours trop vieille est comptée comme bloquée", () => {
  const r = assessOps({
    carnets: [carnet({ processing: 2 })],
    stuck: [
      stuck({
        id: "vieille",
        status: "processing",
        failureReason: null,
        since: ago(STALLED_READING_AFTER_MS),
      }),
      stuck({
        id: "fraiche",
        status: "processing",
        failureReason: null,
        since: ago(60_000),
      }),
    ],
    invitations: [],
    now: NOW,
  });
  assert.deepEqual(
    r.stalledReadings.map((n) => n.id),
    ["vieille"],
  );
  assert.equal(r.runningReadings, 1);
  assert.equal(r.healthy, false);
  assert.match(r.summary, /1 lecture bloquée/);
  // La lecture jeune n'est pas un incident : elle travaille encore.
  assert.match(r.summary, /En attente : 1 lecture en cours\./);
});

test("un brouillon à relire n'est pas un incident — le produit fonctionne ainsi", () => {
  const r = assessOps({
    carnets: [carnet({ draft: 3 }), carnet({ id: "c2", name: "Anouk", draft: 1 })],
    stuck: [],
    invitations: [],
    now: NOW,
  });
  assert.equal(r.drafts, 4);
  assert.equal(r.healthy, true);
  assert.match(r.summary, /Rien à traiter\. En attente : 4 brouillons à relire\./);
});

test("une invitation périmée se distingue d'une invitation en attente", () => {
  const r = assessOps({
    carnets: [carnet()],
    stuck: [],
    invitations: [
      { expiresAt: ago(1) }, // expirée
      { expiresAt: NOW }, // à la seconde près : expirée aussi
      { expiresAt: new Date(NOW.getTime() + 86_400_000) },
    ],
    now: NOW,
  });
  assert.equal(r.expiredInvitations, 2);
  assert.equal(r.pendingInvitations, 1);
  assert.equal(r.healthy, false);
  assert.match(r.summary, /2 invitations expirées/);
});

test("les incidents se cumulent dans une seule phrase lisible", () => {
  const r = assessOps({
    carnets: [carnet({ draft: 2, failed: 2 })],
    stuck: [
      stuck({ id: "a" }),
      stuck({ id: "b" }),
      stuck({
        id: "c",
        status: "processing",
        failureReason: null,
        since: ago(STALLED_READING_AFTER_MS + 1),
      }),
    ],
    invitations: [{ expiresAt: ago(86_400_000) }],
    now: NOW,
  });
  assert.equal(r.healthy, false);
  assert.equal(
    r.summary,
    "À traiter : 2 lectures en échec, 1 lecture bloquée, 1 invitation expirée." +
      " En attente : 2 brouillons à relire.",
  );
});
