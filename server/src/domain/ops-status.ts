export type StuckNote = {
  id: string;
  childId: string;
  child: string | null;
  date: string;
  status: "failed" | "processing";
  failureReason: string | null;
  since: Date;
};

export type OpsCarnet = {
  id: string;
  name: string;
  processing: number;
  draft: number;
  published: number;
  failed: number;
  lastPublishedAt: Date | null;
};

export const STALLED_READING_AFTER_MS = 10 * 60 * 1000;

export type OpsAttention = {
  failedReadings: StuckNote[];
  stalledReadings: StuckNote[];
  runningReadings: number;
  drafts: number;
  pendingInvitations: number;
  expiredInvitations: number;
};

export type OpsAssessment = OpsAttention & {
  healthy: boolean;
  summary: string;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

export function assessOps(params: {
  carnets: OpsCarnet[];
  stuck: StuckNote[];
  invitations: { expiresAt: Date }[];
  now: Date;
}): OpsAssessment {
  const { carnets, stuck, invitations, now } = params;

  const failedReadings = stuck.filter((n) => n.status === "failed");
  const processing = stuck.filter((n) => n.status === "processing");
  const stalledReadings = processing.filter(
    (n) => now.getTime() - n.since.getTime() >= STALLED_READING_AFTER_MS,
  );
  const runningReadings = processing.length - stalledReadings.length;

  const drafts = carnets.reduce((n, c) => n + c.draft, 0);
  const expiredInvitations = invitations.filter(
    (i) => i.expiresAt.getTime() <= now.getTime(),
  ).length;
  const pendingInvitations = invitations.length - expiredInvitations;

  const healthy =
    failedReadings.length === 0 &&
    stalledReadings.length === 0 &&
    expiredInvitations === 0;

  const troubles: string[] = [];
  if (failedReadings.length)
    troubles.push(plural(failedReadings.length, "lecture en échec", "lectures en échec"));
  if (stalledReadings.length)
    troubles.push(
      plural(stalledReadings.length, "lecture bloquée", "lectures bloquées"),
    );
  if (expiredInvitations)
    troubles.push(
      plural(expiredInvitations, "invitation expirée", "invitations expirées"),
    );

  const pending: string[] = [];
  if (drafts)
    pending.push(plural(drafts, "brouillon à relire", "brouillons à relire"));
  if (runningReadings)
    pending.push(plural(runningReadings, "lecture en cours", "lectures en cours"));

  const summary = troubles.length
    ? `À traiter : ${troubles.join(", ")}.${pending.length ? ` En attente : ${pending.join(", ")}.` : ""}`
    : pending.length
      ? `Rien à traiter. En attente : ${pending.join(", ")}.`
      : "Rien à signaler : aucune lecture en échec, aucun brouillon en attente.";

  return {
    failedReadings,
    stalledReadings,
    runningReadings,
    drafts,
    pendingInvitations,
    expiredInvitations,
    healthy,
    summary,
  };
}
