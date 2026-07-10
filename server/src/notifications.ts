import { and, eq, ne } from "drizzle-orm";
import { db } from "./db/index.js";
import { subscriptions, notifications, user } from "./db/schema.js";
import { config } from "./config.js";
import { sendMail, mailEnabled } from "./mailer.js";

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
    const subs = await db
      .select({
        userId: subscriptions.userId,
        emailEnabled: subscriptions.emailEnabled,
        email: user.email,
        name: user.name,
      })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
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
    await Promise.all(
      subs.map(async (s) => {
        const emailedAt =
          canEmail && s.emailEnabled && s.email
            ? await sendEntryEmail(s.email, s.name, title, body, link)
            : null;
        await db.insert(notifications).values({
          userId: s.userId,
          childId,
          entryId,
          type: "entry_published",
          title,
          body,
          emailedAt,
        });
      }),
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
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;line-height:1.5">
  <p>${greeting}</p>
  <p>${body}</p>
  <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Voir la journée</a></p>
  <p style="color:#6b7280;font-size:13px">— Racontine, le journal de l'enfance</p>
</div>`;
  const ok = await sendMail({ to, subject: title, text, html });
  return ok ? new Date() : null;
}
