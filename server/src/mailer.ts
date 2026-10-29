import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";

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

export function mailEnabled(): boolean {
  return getTransport() !== null;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

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
