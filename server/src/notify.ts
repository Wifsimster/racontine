import { config } from "./config.js";
import { mailEnabled, sendMail } from "./mailer.js";
import { renderLinkEmail, type LinkKind } from "./notifications/email-template.js";

export async function deliverLink(
  to: string,
  subject: string,
  url: string,
  kind: LinkKind,
): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  let delivered = false;

  if (mailEnabled()) {
    const { text, html } = renderLinkEmail({ kind, url });
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
    console.log(`[racontine] ${subject} → ${to}\n  ${url}`);
    return;
  }

  if (delivered) {
    console.log(`[racontine] ${subject} → ${to} (lien remis)`);
    return;
  }

  console.error(
    `[racontine] ${subject} → ${to} : AUCUN CANAL DE LIVRAISON CONFIGURÉ, le lien n'a pas été envoyé. ` +
      "Configurez SMTP_HOST (e-mail) ou NOTIFY_WEBHOOK_URL. Le lien n'est volontairement pas journalisé : " +
      "c'est un identifiant de connexion.",
  );
}
