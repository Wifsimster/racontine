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
import { renderEmail } from "./email-template.js";
import { sendPushToUser } from "./push.js";
import { getSettings } from "./settings.js";

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

    // E-mail envoyé seulement si SMTP est configuré ET si le propriétaire n'a pas
    // coupé globalement les e-mails de notification depuis les réglages.
    const { appName, emailNotificationsEnabled } = await getSettings();
    const canEmail = mailEnabled() && emailNotificationsEnabled;

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

        // Web Push : envoyé à tous les appareils enregistrés de l'abonné,
        // indépendamment de la préférence e-mail. No-op si VAPID n'est pas
        // configuré ou si l'abonné n'a aucun appareil. Ne lève jamais.
        await sendPushToUser(s.userId, {
          title,
          body,
          url: link,
          tag: `entry-${entryId}`,
        });

        if (canEmail && s.emailEnabled && s.email) {
          const emailedAt = await sendEntryEmail(
            s.email,
            s.name,
            appName,
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
  appName: string,
  title: string,
  body: string,
  link: string,
): Promise<Date | null> {
  // `childName` (donc title/body) et le nom du destinataire sont saisis par des
  // utilisateurs ; `link` est une URL construite côté serveur. Le gabarit
  // échappe le texte et n'accepte que des liens http(s) : rien de ce qui vient
  // d'un utilisateur ne peut devenir une balise ni un lien de hameçonnage.
  const { text, html } = renderEmail({
    appName,
    title,
    greeting: name ? `Bonjour ${name},` : "Bonjour,",
    paragraphs: [body],
    action: { label: "Voir la journée", url: link },
    note: "Vous recevez cet e-mail parce que vous suivez cet enfant. Vous pouvez couper ces envois depuis l'écran « Les proches ».",
  });
  const ok = await sendMail({ to, subject: title, text, html });
  return ok ? new Date() : null;
}
