import { config } from '../config';
import { createLogger } from '../logger';
import { firstNameFromEmail } from '../utils';
import { getContactsPendingAiReply, saveAiReplyDraft, markAiReplySent } from '../db/queries';
import { sendEmail } from './mailer';
import { generateReplyDraft, isAiPersonalizationConfigured } from './personalize';

const log = createLogger('email:autoReply');

export interface AutoReplyResult {
  drafted: number;
  sent: number;
}

/**
 * For contacts who replied, drafts an AI response. Always saves the draft to the DB
 * (visible for manual review). Only sends it automatically when AUTO_REPLY_ENABLED=true —
 * off by default, since an AI-sent reply to a real prospect is an irreversible action
 * that can misfire (wrong tone, missed context) without a human in the loop.
 */
export async function runAutoReply(): Promise<AutoReplyResult> {
  if (!isAiPersonalizationConfigured()) {
    log.info('ANTHROPIC_API_KEY not set — skipping auto-reply drafting');
    return { drafted: 0, sent: 0 };
  }

  const contacts = await getContactsPendingAiReply(20);
  log.info(`${contacts.length} contacts awaiting AI reply`, { autoSend: config.autoReplyEnabled });

  let drafted = 0;
  let sent = 0;

  for (const contact of contacts) {
    if (!contact.reply_snippet) continue;

    const draft = await generateReplyDraft(contact.company_name, contact.reply_snippet, firstNameFromEmail(contact.email));
    if (!draft) {
      log.warn(`could not draft reply for ${contact.email}`);
      continue;
    }

    await saveAiReplyDraft(contact.id, draft);
    drafted++;

    if (config.autoReplyEnabled) {
      const result = await sendEmail(contact.email, 'Re: tu respuesta', draft);
      if (result.ok) {
        sent++;
        await markAiReplySent(contact.id);
        log.info(`auto-reply sent to ${contact.email}`);
      } else {
        log.error(`auto-reply send failed for ${contact.email}: ${result.error}`);
      }
    } else {
      log.info(`[DRAFT ONLY] reply ready for ${contact.email} — set AUTO_REPLY_ENABLED=true to send automatically`);
    }
  }

  log.info('auto-reply run finished', { drafted, sent });
  return { drafted, sent };
}
