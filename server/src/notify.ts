import { config } from "./config.js";
import { mailEnabled, sendMail } from "./mailer.js";
import { renderEmail } from "./email-template.js";
import { DEFAULT_APP_NAME, getSettings } from "./settings.js";

/**
 * Livraison d'un lien de CAPACITÉ (magic link de connexion, invitation à un
 * cercle) à un proche.
 *
 * CES URL SONT DES IDENTIFIANTS. Qui tient le lien tient le compte : le magic
 * link ouvre une session, le lien d'invitation fait entrer dans le cercle d'un
 * enfant. Ils étaient jusqu'ici écrits en clair sur la sortie standard —
 * c'est-à-dire dans `docker logs`, dans le collecteur de logs du homelab, et
 * dans tout ce qui les archive. Quiconque lisait les logs prenait un compte.
 *
 * La règle est donc : en production, l'URL ne s'écrit JAMAIS dans un log. Elle
 * part par e-mail (SMTP) ou par le webhook, et si aucun des deux n'est
 * configuré, on le dit BRUYAMMENT à l'exploitant plutôt que de retomber en
 * douce sur la sortie standard. Un lien non livré est un incident visible ; un
 * lien livré par les logs est une fuite invisible.
 *
 * En développement, il n'y a ni SMTP ni webhook : l'URL reste affichée, parce
 * que c'est le seul moyen de se connecter en local et qu'il n'y a rien à
 * protéger sur un poste de dev.
 *
 * Note : le lien d'INVITATION n'a jamais dépendu de ce canal. Il est renvoyé
 * dans la réponse de création (`POST /api/children/:childId/invitations`) et
 * l'admin le copie depuis l'écran Partage pour l'envoyer lui-même. Fermer les
 * logs ne casse donc rien de ce côté.
 */

/**
 * Les deux liens qu'on envoie. Le type porte tout ce qui change d'un e-mail à
 * l'autre : l'appelant ne rédige plus, il dit de quoi il s'agit — ainsi un
 * lien de connexion a partout le même sujet, la même mise en page et le même
 * avertissement.
 */
export type LinkKind = "magic-link" | "invitation";

type LinkCopy = {
  subject: (appName: string) => string;
  title: (appName: string) => string;
  paragraphs: (appName: string) => string[];
  action: string;
  note: string;
};

const COPY: Record<LinkKind, LinkCopy> = {
  "magic-link": {
    subject: (a) => `Votre lien de connexion ${a}`,
    title: () => "Votre lien de connexion",
    paragraphs: (a) => [
      `Voici votre lien de connexion à ${a}. Il vous ouvre une session sans mot de passe, sur cet appareil ou sur un autre.`,
    ],
    action: "Se connecter",
    note: "Ce lien est personnel et vaut identifiant : ne le transmettez à personne. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
  },
  invitation: {
    subject: (a) => `Invitation à suivre un enfant sur ${a}`,
    title: () => "Vous êtes invité·e à suivre un enfant",
    paragraphs: (a) => [
      `Un parent vous ouvre le journal de son enfant sur ${a} : les journées y sont écrites à partir du carnet de liaison, et vous les recevrez au fil des publications.`,
      "Ouvrez le lien ci-dessous pour rejoindre le cercle.",
    ],
    action: "Rejoindre le cercle",
    note: "Ce lien est personnel et vaut identifiant : ne le transmettez à personne. Il expire au bout de quelques jours.",
  },
};

/** Nom de l'instance, sans jamais faire échouer un envoi si la base tousse. */
async function appName(): Promise<string> {
  try {
    return (await getSettings()).appName;
  } catch {
    return DEFAULT_APP_NAME;
  }
}

export async function deliverLink(
  to: string,
  kind: LinkKind,
  url: string,
): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const name = await appName();
  const copy = COPY[kind];
  const subject = copy.subject(name);
  let delivered = false;

  if (mailEnabled()) {
    const { text, html } = renderEmail({
      appName: name,
      title: copy.title(name),
      paragraphs: copy.paragraphs(name),
      action: { label: copy.action, url },
      note: copy.note,
      preheader: subject,
    });
    delivered = await sendMail({ to, subject, text, html });
  }

  if (config.notifyWebhookUrl) {
    try {
      await fetch(config.notifyWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Title: subject },
        body: `${to} : ${url}`,
      });
      delivered = true;
    } catch (err) {
      console.error(
        "[racontine] échec de la notification webhook :",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!isProd) {
    // Dev : pas de SMTP, pas de webhook — le lien s'affiche, c'est la seule
    // façon de se connecter en local.
    console.log(`[racontine] ${subject} → ${to}\n  ${url}`);
    return;
  }

  if (delivered) {
    // Trace d'exploitation, sans la capacité : qui, quoi, pas l'URL.
    console.log(`[racontine] ${subject} → ${to} (lien remis)`);
    return;
  }

  console.error(
    `[racontine] ${subject} → ${to} : AUCUN CANAL DE LIVRAISON CONFIGURÉ, le lien n'a pas été envoyé. ` +
      "Configurez SMTP_HOST (e-mail) ou NOTIFY_WEBHOOK_URL. Le lien n'est volontairement pas journalisé : " +
      "c'est un identifiant de connexion.",
  );
}
