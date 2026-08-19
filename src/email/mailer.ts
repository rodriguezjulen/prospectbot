import axios from 'axios';
import nodemailer, { type Transporter } from 'nodemailer';
import { config, isSmtpConfigured, isResendConfigured } from '../config';
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

async function sendViaResend(to: string, subject: string, text: string): Promise<SendResult> {
  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: `${config.emailFromName} <${config.emailFrom}>`,
        to: [to],
        subject,
        text,
        reply_to: config.emailReplyTo || config.emailFrom,
      },
      {
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
        timeout: 15_000,
      }
    );
    return { ok: true };
  } catch (err) {
    const message = errorMessage(err);
    log.error(`Resend send failed for ${to}: ${message}`);
    return { ok: false, error: message };
  }
}

async function sendViaSmtp(to: string, subject: string, text: string): Promise<SendResult> {
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
    log.error(`SMTP send failed for ${to}: ${message}`);
    return { ok: false, error: message };
  }
}

/** Sends one plain-text email — prefers Resend (single API key) when configured, else falls back to SMTP. */
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (isResendConfigured()) return sendViaResend(to, subject, text);
  if (isSmtpConfigured()) return sendViaSmtp(to, subject, text);
  return { ok: false, error: 'no email provider configured (set RESEND_API_KEY or SMTP_*)' };
}

/** Verifies the active email provider is reachable before a batch send. Resend has no verify endpoint, so a configured key is treated as ready. */
export async function verifyEmailProvider(): Promise<boolean> {
  if (isResendConfigured()) return true;
  if (!isSmtpConfigured()) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (err) {
    log.error(`SMTP verify failed: ${errorMessage(err)}`);
    return false;
  }
}
