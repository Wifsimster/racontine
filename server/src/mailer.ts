import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";

/**
 * Transport SMTP paresseux. Null si SMTP n'est pas configuré (SMTP_HOST absent) :
 * dans ce cas les envois sont silencieusement ignorés — la fonctionnalité
 * dégrade proprement vers les seules notifications in-app.
 */
let transporter: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!config.mail.host) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth:
      config.mail.user && config.mail.pass
        ? { user: config.mail.user, pass: config.mail.pass }
        : undefined,
  });
  return transporter;
}

/** True si un transport e-mail est configuré. */
export function mailEnabled(): boolean {
  return getTransport() !== null;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Envoie un e-mail. Ne lève jamais : une notification e-mail ratée ne doit pas
 * faire échouer l'action métier (publication d'une entrée). Renvoie true si
 * l'e-mail a été remis au serveur SMTP.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const tx = getTransport();
  if (!tx) return false;
  try {
    await tx.sendMail({
      from: config.mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err) {
    console.error(
      "Échec de l'envoi d'e-mail :",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
