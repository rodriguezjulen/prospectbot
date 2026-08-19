import nodemailer, { type Transporter } from 'nodemailer';
import { config, isSmtpConfigured } from '../config';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('email:mailer');

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return transporter;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Sends one plain-text email via the configured SMTP account. Returns ok:false (never throws) on failure so a batch send can continue. */
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!isSmtpConfigured()) {
    return { ok: false, error: 'SMTP not configured' };
  }
  try {
    await getTransporter().sendMail({
      from: `${config.emailFromName} <${config.emailFrom}>`,
      to,
      subject,
      text,
      replyTo: config.emailReplyTo || config.emailFrom,
    });
    return { ok: true };
  } catch (err) {
    const message = errorMessage(err);
    log.error(`send failed for ${to}: ${message}`);
    return { ok: false, error: message };
  }
}

export async function verifySmtp(): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (err) {
    log.error(`SMTP verify failed: ${errorMessage(err)}`);
    return false;
  }
}
