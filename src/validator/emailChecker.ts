const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Basic RFC-ish format check. Not a full validator — good enough to filter obvious garbage. */
export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

const DISPOSABLE_DOMAINS = new Set(['mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com']);

export function isDisposableDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return DISPOSABLE_DOMAINS.has(domain);
}

import dns from 'dns/promises';
import { createLogger } from '../logger';

const log = createLogger('validator:email');

/** Checks the email's domain has MX records. Fails open (returns true) on DNS errors so a resolver hiccup doesn't drop good leads. */
export async function hasMxRecord(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch (err) {
    log.warn(`MX lookup failed for ${domain}, assuming valid`, err);
    return true;
  }
}
