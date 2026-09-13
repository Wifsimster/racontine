import { and, eq, ne } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  subscriptions,
  notifications,
  memberships,
  entries,
  entryItems,
  user,
} from "./db/schema.js";
import { config } from "./config.js";
import { sendMail, mailEnabled } from "./mailer.js";
import { sendPushToUser } from "./push.js";
import { getSettings } from "./settings.js";

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

    // E-mail envoyé seulement si SMTP est configuré ET si le propriétaire n'a pas
    // coupé globalement les e-mails de notification depuis les réglages.
    const { emailNotificationsEnabled } = await getSettings();
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
          const emailedAt = await sendEntryEmail(s.email, s.name, title, body, link, {
            entryId,
            childName,
            dateLabel,
          });
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

/* ===========================================================================
   L'E-MAIL — la seule surface du produit qui sorte de chez vous.

   Une mamie lectrice ne verra peut-être jamais l'app : elle reçoit un e-mail le
   soir et clique. Cet e-mail était pourtant le seul endroit de Racontine où une
   couleur ne voulait rien dire — `system-ui`, une encre #1f2937 et un bouton
   #4f46e5, l'indigo par défaut de la bibliothèque d'origine. Or dans le
   vocabulaire chromatique du produit, l'indigo VEUT DIRE « sieste ». Le premier
   écran d'un proche ressemblait à un échafaudage qu'on avait oublié de
   repeindre.

   Il porte maintenant le carnet : papier, feuille bordée de son trait de marge
   groseille, encre bleu-nuit, bouton groseille, et la signature du produit en
   pied. Toutes les valeurs viennent des jetons de web/src/index.css.

   TROIS CONTRAINTES PROPRES À L'E-MAIL, qui expliquent les choix d'écriture :

   1. AUCUNE WEBFONT NE CHARGE dans la plupart des clients de messagerie. Le
      titre est donc en Georgia, qui est déjà la police de repli déclarée de
      `--font-serif` : le repli du produit, pas un repli improvisé.
   2. PAS DE FEUILLE DE STYLE. Gmail retire `<style>` ; tout est en style en
      ligne, et la mise en page passe par des tableaux, pas par flex.
   3. LE MODE SOMBRE N'EST PAS PILOTABLE de façon fiable d'un client à l'autre.
      On reste donc en clair, avec des couleurs explicites partout : un fond
      laissé implicite est exactement ce qui produit du texte noir sur noir chez
      les clients qui inversent.

   Enfin l'e-mail montre ce qu'il annonce : la bande de feutres de la journée
   (« 2 repas · sieste 2 h 05 · joyeuse »), dans les mêmes teintes et avec les
   mêmes mots que le journal. Ce n'est pas un ornement — un proche qui lit ça
   dans sa boîte a déjà reçu quelque chose, même s'il ne clique pas ce soir-là.
   =========================================================================== */

/** Les jetons du carnet, en sRGB (web/src/index.css). */
const INK = {
  paper: "#F9F7F2",
  sheet: "#FEFDFA",
  text: "#242846",
  pale: "#5E6276",
  border: "#DBDDE8",
  primary: "#B8284D",
  onPrimary: "#FDFCF7",
  /* Le trait de marge de la marque, sur la tuile. La teinte est le papier à
     50 % sur le groseille, COMPOSÉE À LA MAIN : `opacity` n'est pas fiable d'un
     client de messagerie à l'autre, et une marque à moitié transparente qui
     devient opaque chez Outlook n'est plus la même marque. */
  marginOnTile: "#D990A0",
};

/**
 * Les teintes de la bande, en paires (encre, fond) — les mêmes qu'à l'écran.
 *
 * DEUX FEUTRES, ET UN NEUTRE, et ce n'est pas un oubli : l'humeur n'est pas un
 * type de moment. Le journal le dit explicitement (« l'humeur reste à
 * l'encre ; cette absence de feutre est une information ») et la règle du
 * système l'impose — le prune veut dire « anecdote », il ne peut pas vouloir
 * dire « joyeuse » deux centimètres plus bas.
 */
const FEUTRE = {
  meal: { ink: "#7D4A1E", bg: "#FDE9D4" }, // --meal / --meal-bg
  nap: { ink: "#3F4E97", bg: "#E7ECFF" }, // --nap / --nap-bg
  mood: { ink: "#242846", bg: "#EBECF2" }, // --foreground / --muted
} as const;

/** Espace insécable : « 2 h 05 » — typographie française. */
const NBSP = "\u00a0";

function parseTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}${NBSP}min`;
  if (m === 0) return `${h}${NBSP}h`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

/** L'humeur en un mot, comme sur la bande de feutres du journal. */
function moodShort(mood: string): string | null {
  const first = mood.split(/[,;]| et | puis /i)[0].trim();
  if (first.length <= 16) return first;
  const cut = first.slice(0, 16);
  const space = cut.lastIndexOf(" ");
  return space >= 4 ? cut.slice(0, space) + "\u2026" : null;
}

export type Chip = { label: string; tone: keyof typeof FEUTRE };

/**
 * La bande de feutres de la journée, dans l'ORDRE des questions qu'on se pose
 * en ouvrant l'app : a-t-il mangé, a-t-il dormi, comment était-il. Trois au
 * plus — la même règle qu'à l'écran, pour la même raison : au-delà, la bande
 * crie plus fort que le titre.
 *
 * Les mots sont ceux du journal, au caractère près (« sieste 2 h 05 » pour une
 * seule, « siestes 2 h 05 » pour le cumul) : une même journée ne peut pas se
 * résumer différemment selon qu'on la lit dans l'app ou dans sa boîte.
 */
async function glanceOf(entryId: string): Promise<Chip[]> {
  const [rows, [entry]] = await Promise.all([
    db
      .select({ type: entryItems.type, data: entryItems.data })
      .from(entryItems)
      .where(eq(entryItems.entryId, entryId)),
    db
      .select({ mood: entries.mood })
      .from(entries)
      .where(eq(entries.id, entryId))
      .limit(1),
  ]);

  const chips: Chip[] = [];

  const meals = rows.filter((r) => r.type === "meal");
  if (meals.length > 0)
    chips.push({ label: `${meals.length} repas`, tone: "meal" });

  const naps = rows.filter((r) => r.type === "nap");
  if (naps.length > 0) {
    let total = 0;
    for (const n of naps) {
      const d = n.data as { debut?: string; fin?: string };
      const a = parseTime(d.debut);
      const b = parseTime(d.fin);
      if (a !== null && b !== null && b > a) total += b - a;
    }
    const noun = naps.length > 1 ? "siestes" : "sieste";
    chips.push({
      label: total > 0 ? `${noun} ${formatDuration(total)}` : `${naps.length} ${noun}`,
      tone: "nap",
    });
  }

  const short = entry?.mood ? moodShort(entry.mood) : null;
  if (short) chips.push({ label: short, tone: "mood" });

  return chips;
}

function chipsHtml(chips: Chip[]): string {
  if (chips.length === 0) return "";
  const cells = chips
    .map(
      (c) =>
        `<td style="background:${FEUTRE[c.tone].bg};color:${FEUTRE[c.tone].ink};border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(c.label)}</td>`,
    )
    .join('<td style="width:6px"></td>');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px"><tr>${cells}</tr></table>`;
}

/**
 * La marque, en e-mail : une tuile de 24 px dessinée en TABLEAU, pas en image.
 *
 * Un PNG distant serait bloqué par défaut par la plupart des clients (« images
 * non affichées ») — la marque disparaîtrait précisément chez les gens les plus
 * prudents. Deux cellules colorées suffisent à poser la tuile groseille et son
 * trait de marge ; le R, lui, n'y survivrait pas et n'est pas tenté.
 */
function markHtml(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:24px;height:24px;background:${INK.primary};border-radius:6px"><tr>
    <td style="width:6px"></td>
    <td style="width:2px;background:${INK.marginOnTile}"></td>
    <td></td>
  </tr></table>`;
}

/**
 * Le gabarit, isolé de l'envoi : c'est ce qui le rend testable (voir
 * `notifications.test.ts`). Un e-mail qui repart en #4f46e5 ou qui cesse
 * d'échapper un prénom doit faire rougir la CI, pas se découvrir dans la boîte
 * de réception d'une grand-mère.
 */
export function renderEntryEmail(params: {
  greeting: string;
  body: string;
  link: string;
  childName: string;
  dateLabel: string;
  chips: Chip[];
}): { text: string; html: string } {
  const { greeting, body, link, childName, dateLabel, chips } = params;
  const day = { childName, dateLabel };

  // La version TEXTE est un vrai repli, pas un pense-bête : elle porte la même
  // bande de feutres, en toutes lettres.
  const glance = chips.map((c) => c.label).join(" \u00b7 ");
  const text =
    `${greeting}\n\n${body}\n` +
    (glance ? `\n${glance}\n` : "") +
    `\nOuvrir la journée : ${link}\n\n\u2014 Propulsé par Racontine`;

  // childName (donc title/body), le nom du destinataire et l'humeur sont saisis
  // par des utilisateurs ou écrits par le modèle : on les échappe avant
  // interpolation HTML pour éviter toute injection de balises (liens de
  // phishing, images traçantes…). `link` est une URL construite côté serveur.
  const html = `<div style="margin:0;padding:24px 12px;background:${INK.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK.text}">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:480px;margin:0 auto">
    <tr><td style="padding-bottom:14px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td style="vertical-align:middle">${markHtml()}</td>
        <td style="vertical-align:middle;padding-left:10px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">Carnet de liaison</td>
      </tr></table>
    </td></tr>

    <tr><td>
      <!-- La feuille : bord gauche carré, posé sur son trait de marge
           groseille — la même géométrie que la feuille de l'écran de
           connexion, où une page est reliée du côté de la couture. -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr>
          <td style="width:3px;background:${INK.primary}"></td>
          <td style="background:${INK.sheet};border:1px solid ${INK.border};border-left:0;border-radius:0 16px 16px 0;padding:20px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">${escapeHtml(day.dateLabel)}</p>
            <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;font-weight:600;color:${INK.text}">La journée de ${escapeHtml(day.childName)}</p>
            ${chipsHtml(chips)}
            <p style="margin:0 0 8px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(body)}</p>
            <a href="${encodeURI(link)}" style="display:inline-block;padding:12px 22px;background:${INK.primary};color:${INK.onPrimary};border-radius:16px;font-size:15px;font-weight:700;text-decoration:none">Ouvrir la journée</a>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding-top:16px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">Propulsé par Racontine</td></tr>
  </table>
</div>`;

  return { text, html };
}

async function sendEntryEmail(
  to: string,
  name: string,
  title: string,
  body: string,
  link: string,
  day: { entryId: string; childName: string; dateLabel: string },
): Promise<Date | null> {
  const { text, html } = renderEntryEmail({
    greeting: name ? `Bonjour ${name},` : "Bonjour,",
    body,
    link,
    childName: day.childName,
    dateLabel: day.dateLabel,
    chips: await glanceOf(day.entryId),
  });
  const ok = await sendMail({ to, subject: title, text, html });
  return ok ? new Date() : null;
}
