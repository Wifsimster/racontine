import { config } from "./config.js";
import { mailEnabled, sendMail } from "./mailer.js";

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
export async function deliverLink(
  to: string,
  subject: string,
  url: string,
): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  let delivered = false;

  if (mailEnabled()) {
    delivered = await sendMail({
      to,
      subject,
      text: `${subject}\n\n${url}\n\nCe lien est personnel : ne le transmettez à personne.`,
    });
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
