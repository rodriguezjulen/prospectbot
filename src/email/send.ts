import { config, isEmailProviderConfigured } from '../config';
import { createLogger } from '../logger';
import { sleep, firstNameFromEmail } from '../utils';
import { getContactsPendingEmail, markContactEmailed } from '../db/queries';
import { pool, pingDb } from '../db/pool';
import { sendEmail, verifyEmailProvider } from './mailer';
import { renderEmail, defaultBodyTemplate } from './template';
import { generateOpeningLine, isAiPersonalizationConfigured } from './personalize';

const log = createLogger('email:send');

export interface SendRunResult {
  attempted: number;
  sent: number;
  failed: number;
  dryRun: boolean;
}

/**
 * Sends cold emails to contacts that haven't been emailed yet, up to EMAIL_DAILY_LIMIT.
 * Dry-run (no SMTP send, no DB writes) unless SEND_EMAILS=true — this is a real,
 * irreversible outbound action, so it must be explicitly enabled.
 */
export async function runEmailSend(): Promise<SendRunResult> {
  const dryRun = !config.sendEmails;

  if (!dryRun && !isEmailProviderConfigured()) {
    log.error('SEND_EMAILS=true but no email provider is configured (set RESEND_API_KEY + EMAIL_FROM, or SMTP_*) — aborting');
    return { attempted: 0, sent: 0, failed: 0, dryRun: true };
  }

  const dbUp = await pingDb();
  if (!dbUp) {
    log.error('database unreachable — cannot select pending contacts');
    return { attempted: 0, sent: 0, failed: 0, dryRun };
  }

  if (!dryRun) {
    const providerOk = await verifyEmailProvider();
    if (!providerOk) {
      log.error('email provider verification failed — aborting send');
      return { attempted: 0, sent: 0, failed: 0, dryRun };
    }
  }

  const contacts = await getContactsPendingEmail(config.emailDailyLimit);
  log.info(`${contacts.length} contacts pending email (limit ${config.emailDailyLimit})`, {
    dryRun,
    aiPersonalization: isAiPersonalizationConfigured(),
  });

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const openingLine = await generateOpeningLine(contact.company_name, contact.domain, contact.tech_stack);

    const { subject, text } = renderEmail(
      {
        first_name: firstNameFromEmail(contact.email),
        company: contact.company_name,
        job_title: contact.job_title ?? '',
        email: contact.email,
      },
      config.emailFromName,
      config.emailSubject,
      defaultBodyTemplate,
      config.emailUnsubscribeText,
      openingLine
    );

    if (dryRun) {
      log.info(`[DRY RUN] would send to ${contact.email}: "${subject}"`);
      continue;
    }

    const result = await sendEmail(contact.email, subject, text);
    if (result.ok) {
      sent++;
      await markContactEmailed(contact.id, 'sent');
      log.info(`sent to ${contact.email}`);
    } else {
      failed++;
      await markContactEmailed(contact.id, 'failed');
      log.error(`failed to send to ${contact.email}: ${result.error}`);
    }
    await sleep(config.emailDelayMs);
  }

  log.info('email run finished', { attempted: contacts.length, sent, failed, dryRun });
  return { attempted: contacts.length, sent, failed, dryRun };
}

if (require.main === module) {
  runEmailSend()
    .then((result) => {
      if (result.dryRun) {
        console.log('\nDRY RUN — no se envió ningún email de verdad.');
        console.log('Para enviar de verdad: configura RESEND_API_KEY + EMAIL_FROM en .env y pon SEND_EMAILS=true.\n');
      }
      return pool.end();
    })
    .catch((err) => {
      log.error('email send run failed', err);
      process.exitCode = 1;
    });
}
