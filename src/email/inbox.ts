import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { config, isImapConfigured } from '../config';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';
import { markContactReplied, getPendingReplyEmails } from '../db/queries';

const log = createLogger('email:inbox');

export interface InboxCheckResult {
  checked: number;
  newReplies: number;
}

function extractSnippet(text: string | undefined): string {
  if (!text) return '';
  const cleaned = text.replace(/\r/g, '').split(/\n\s*\n/)[0] ?? text;
  return cleaned.trim().slice(0, 280);
}

const LOOKBACK_DAYS = 14;

/**
 * Scans recent inbox messages (last LOOKBACK_DAYS) for replies from contacts we're
 * waiting to hear back from. Filters by envelope (cheap) before downloading any body,
 * so this stays fast even on inboxes with a large unread backlog unrelated to
 * ProspectBot. Safe no-op when IMAP isn't configured or there's nobody to hear from.
 */
export async function checkInboxForReplies(): Promise<InboxCheckResult> {
  if (!isImapConfigured()) {
    log.info('IMAP not configured — skipping reply check');
    return { checked: 0, newReplies: 0 };
  }

  const pendingEmails = new Set(await getPendingReplyEmails());
  if (pendingEmails.size === 0) {
    log.info('no contacts awaiting a reply — skipping inbox scan');
    return { checked: 0, newReplies: 0 };
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: { user: config.imapUser, pass: config.imapPass },
    logger: false,
  });

  let checked = 0;
  let newReplies = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since }, { uid: true });

      if (uids && uids.length > 0) {
        for await (const msg of client.fetch(uids, { envelope: true }) as AsyncIterable<FetchMessageObject>) {
          checked++;
          const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase();
          if (!fromAddr || !pendingEmails.has(fromAddr)) continue;

          const { content } = await client.download(msg.uid, undefined, { uid: true });
          const chunks: Buffer[] = [];
          for await (const chunk of content) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          const snippet = extractSnippet(raw.replace(/^[\s\S]*?\r?\n\r?\n/, ''));

          const contactId = await markContactReplied(fromAddr, snippet);
          if (contactId) {
            newReplies++;
            log.info(`reply detected from ${fromAddr}`);
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    log.error(`inbox check failed: ${errorMessage(err)}`);
  } finally {
    try {
      await client.logout();
    } catch {
      // connection may already be closed
    }
  }

  log.info('inbox check finished', { checked, newReplies });
  return { checked, newReplies };
}

if (require.main === module) {
  checkInboxForReplies()
    .then((result) => {
      console.log(`Revisados: ${result.checked}, respuestas nuevas: ${result.newReplies}`);
      process.exit(0);
    })
    .catch((err) => {
      log.error('inbox check run failed', err);
      process.exitCode = 1;
    });
}
