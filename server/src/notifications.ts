import { and, eq, ne } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  subscriptions,
  notifications,
  memberships,
  user,
} from "./db/schema.js";
import { config } from "./config.js";
import { sendMail, mailEnabled } from "./mailer.js";

/** Échappe le texte destiné à être interpolé dans du HTML d'e-mail. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateFr(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Notifie tous les abonnés à la timeline d'un enfant qu'une journée vient
 * d'être publiée : une notification in-app par abonné + un e-mail pour ceux qui
 * l'ont activé. L'auteur de la publication (`actorUserId`) est exclu — inutile
 * de se notifier soi-même.
 *
 * Ne lève jamais : la notification est un effet de bord de la publication et ne
 * doit pas la faire échouer.
 */
export async function notifyEntryPublished(params: {
  entryId: string;
  childId: string;
  childName: string;
  date: string;
  actorUserId?: string | null;
}): Promise<void> {
  const { entryId, childId, childName, date, actorUserId } = params;
  try {
    // Uniquement les abonnés qui sont ENCORE membres du cercle de l'enfant : un
    // proche dont l'accès a été révoqué ne doit plus recevoir de notifications,
    // même si sa ligne d'abonnement subsiste (jointure sur memberships).
    const subs = await db
      .select({
        userId: subscriptions.userId,
        emailEnabled: subscriptions.emailEnabled,
        email: user.email,
        name: user.name,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, subscriptions.userId),
          eq(memberships.childId, subscriptions.childId),
        ),
      )
      .where(
        actorUserId
          ? and(
              eq(subscriptions.childId, childId),
              ne(subscriptions.userId, actorUserId),
            )
          : eq(subscriptions.childId, childId),
      );

    if (subs.length === 0) return;

    const dateLabel = formatDateFr(date);
    const title = `Nouvelle journée de ${childName}`;
    const body = `La journée du ${dateLabel} vient d'être publiée dans le journal de ${childName}.`;
    const link = `${config.webBaseUrl}/entries/${entryId}`;

    const canEmail = mailEnabled();

    // Une notif in-app par abonné, plus un e-mail si activé et SMTP configuré.
    // On persiste d'abord la notification in-app, puis on tente l'e-mail : ainsi
    // un échec d'envoi ne prive jamais l'abonné de sa notification. allSettled
    // isole les échecs par destinataire (un abonné en échec n'annule pas les
    // autres).
    const results = await Promise.allSettled(
      subs.map(async (s) => {
        const [row] = await db
          .insert(notifications)
          .values({
            userId: s.userId,
            childId,
            entryId,
            type: "entry_published",
            title,
            body,
          })
          .returning({ id: notifications.id });

        if (canEmail && s.emailEnabled && s.email) {
          const emailedAt = await sendEntryEmail(
            s.email,
            s.name,
            title,
            body,
            link,
          );
          if (emailedAt)
            await db
              .update(notifications)
              .set({ emailedAt })
              .where(eq(notifications.id, row.id));
        }
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed)
      console.error(
        `Notification des abonnés : ${failed}/${subs.length} en échec.`,
      );
  } catch (err) {
    console.error(
      "Échec de la notification des abonnés :",
      err instanceof Error ? err.message : err,
    );
  }
}

async function sendEntryEmail(
  to: string,
  name: string,
  title: string,
  body: string,
  link: string,
): Promise<Date | null> {
  const greeting = name ? `Bonjour ${name},` : "Bonjour,";
  const text = `${greeting}\n\n${body}\n\nVoir la journée : ${link}\n\n— Racontine`;
  // childName (donc title/body) et le nom du destinataire sont saisis par des
  // utilisateurs : on les échappe avant interpolation HTML pour éviter toute
  // injection de balises (liens de phishing, images traçantes…). link est une
  // URL construite côté serveur.
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;line-height:1.5">
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(body)}</p>
  <p><a href="${encodeURI(link)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Voir la journée</a></p>
  <p style="color:#6b7280;font-size:13px">— Racontine, le journal de l'enfance</p>
</div>`;
  const ok = await sendMail({ to, subject: title, text, html });
  return ok ? new Date() : null;
}
