/* ===========================================================================
   L'ÉTAT D'EXPLOITATION — ce qui demande une intervention, et ce qui va bien.

   Une instance de Racontine tourne sur le homelab de quelqu'un : personne ne
   regarde de tableau de bord. Ce qui se dégrade se dégrade en silence — une
   lecture VLM morte avec le processus, un brouillon jamais relu, une invitation
   expirée que le proche n'ose pas réclamer. Ce module dit, en une fonction pure,
   ce que ces signaux veulent dire ensemble : rien à faire, ou voici quoi.

   Pure, parce que c'est une règle de jugement et non une requête : on doit
   pouvoir vérifier « une lecture de onze minutes est perdue » sans base, sans
   réseau et sans attendre onze minutes.
   =========================================================================== */

/** Une journée coincée : en échec, ou en lecture depuis trop longtemps. */
export type StuckNote = {
  id: string;
  childId: string;
  child: string | null;
  date: string;
  status: "failed" | "processing";
  /** Message d'échec déjà sûr à afficher (null tant que la lecture court). */
  failureReason: string | null;
  /** Dernier changement d'état — l'âge de l'échec ou de la lecture. */
  since: Date;
};

/** Un carnet administré, réduit à ce qui intéresse l'exploitation. */
export type OpsCarnet = {
  id: string;
  name: string;
  processing: number;
  draft: number;
  published: number;
  failed: number;
  lastPublishedAt: Date | null;
};

/**
 * Au-delà de ce délai, une lecture « en cours » ne reviendra plus : le client
 * Anthropic coupe à trois minutes et ne réessaie qu'une fois (voir `vlm.ts`),
 * soit ~6 min de budget total. Dix minutes laissent la marge d'un serveur lent
 * sans laisser croire qu'une lecture morte au redémarrage travaille encore.
 */
export const STALLED_READING_AFTER_MS = 10 * 60 * 1000;

/** Ce qui attend une main humaine (ou celle d'un agent). */
export type OpsAttention = {
  /** Lectures en échec, relançables par `retry_daily_note`. */
  failedReadings: StuckNote[];
  /** Lectures « en cours » trop vieilles pour aboutir — mortes, en pratique. */
  stalledReadings: StuckNote[];
  /** Lectures en cours d'âge normal : rien à faire, sinon attendre. */
  runningReadings: number;
  /** Brouillons à relire puis publier. */
  drafts: number;
  /** Invitations envoyées, pas encore acceptées. */
  pendingInvitations: number;
  /** Invitations dont le lien est périmé : à révoquer ou à renvoyer. */
  expiredInvitations: number;
};

export type OpsAssessment = OpsAttention & {
  /** Vrai quand rien n'attend personne. */
  healthy: boolean;
  /** Une phrase française, lisible telle quelle par qui pilote l'instance. */
  summary: string;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

/**
 * Juge l'état d'exploitation à partir de ce qu'on a pu lire. `now` est passé en
 * argument : l'âge d'une lecture est une décision, pas une horloge implicite.
 *
 * Les brouillons ne comptent PAS comme un incident — un carnet photographié le
 * soir et relu le lendemain est le fonctionnement normal du produit. Ils sont
 * rapportés parce qu'un agent doit savoir quoi proposer, pas parce qu'ils
 * rendraient l'instance malade.
 */
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
