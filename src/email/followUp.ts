import { config, isEmailProviderConfigured } from '../config';
import { createLogger } from '../logger';
import { sleep, firstNameFromEmail } from '../utils';
import { getContactsPendingFollowUp, markContactFollowedUp } from '../db/queries';
import { sendEmail } from './mailer';

const log = createLogger('email:followUp');

export interface FollowUpResult {
  attempted: number;
  sent: number;
  failed: number;
  dryRun: boolean;
}

const FOLLOW_UP_SUBJECT_PREFIX = 'Re: ';

function renderFollowUp(firstName: string, company: string, originalSubject: string): { subject: string; text: string } {
  const subject = originalSubject.startsWith(FOLLOW_UP_SUBJECT_PREFIX) ? originalSubject : `${FOLLOW_UP_SUBJECT_PREFIX}${originalSubject}`;
  const text = `Hola ${firstName || 'equipo'},

Te escribí hace unos días sobre ${company} — no sé si te llegó o simplemente se te pasó entre el resto de correos.

¿Tiene sentido para vosotros ahora mismo, o prefieres que lo retome más adelante?

Saludos,
${config.emailFromName}

---
${config.emailUnsubscribeText}`;
  return { subject, text };
}

/**
 * Sends a short bump follow-up to contacts who were emailed but never replied,
 * after FOLLOW_UP_DELAY_DAYS, up to FOLLOW_UP_MAX times. Dry-run unless SEND_EMAILS=true,
 * same safety gate as the initial send.
 */
export async function runFollowUp(): Promise<FollowUpResult> {
  const dryRun = !config.sendEmails;

  if (!dryRun && !isEmailProviderConfigured()) {
    log.error('SEND_EMAILS=true but no email provider configured — skipping follow-ups');
    return { attempted: 0, sent: 0, failed: 0, dryRun: true };
  }

  const contacts = await getContactsPendingFollowUp(config.followUpDelayDays, config.followUpMax, config.emailDailyLimit);
  log.info(`${contacts.length} contacts due for follow-up`, { dryRun });

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const { subject, text } = renderFollowUp(firstNameFromEmail(contact.email), contact.company_name, config.emailSubject);

    if (dryRun) {
      log.info(`[DRY RUN] would follow up with ${contact.email} (attempt ${contact.follow_up_count + 1}): "${subject}"`);
      continue;
    }

    const result = await sendEmail(contact.email, subject, text);
    if (result.ok) {
      sent++;
      await markContactFollowedUp(contact.id, 'sent');
      log.info(`follow-up sent to ${contact.email}`);
    } else {
      failed++;
      await markContactFollowedUp(contact.id, 'failed');
      log.error(`follow-up failed for ${contact.email}: ${result.error}`);
    }
    await sleep(config.emailDelayMs);
  }

  log.info('follow-up run finished', { attempted: contacts.length, sent, failed, dryRun });
  return { attempted: contacts.length, sent, failed, dryRun };
}

if (require.main === module) {
  runFollowUp()
    .then((result) => {
      if (result.dryRun) console.log('\nDRY RUN — ningún follow-up real enviado.');
      process.exit(0);
    })
    .catch((err) => {
      log.error('follow-up run failed', err);
      process.exitCode = 1;
    });
}
