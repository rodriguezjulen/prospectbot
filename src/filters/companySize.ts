import axios from 'axios';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('filters:size');

const SIZE_BUCKETS = ['1-9', '10-49', '50-249', '250-500', '500+'] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

/**
 * No dedicated company-size API in this project's free-tier stack, so size is
 * estimated deterministically from the domain (stable across runs) as a
 * placeholder signal. Swap for a real enrichment source (Clearbit, Hunter
 * "company" endpoint, etc.) when budget allows.
 */
export function estimateSizeRange(domain: string): SizeBucket {
  let hash = 0;
  for (const ch of domain) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const bucket = SIZE_BUCKETS[hash % SIZE_BUCKETS.length];
  return bucket ?? '10-49';
}

export function bucketWithinRange(bucket: SizeBucket, min: number, max: number): boolean {
  const [lowStr, highStr] = bucket.replace('+', '-999999').split('-');
  const low = Number(lowStr);
  const high = Number(highStr);
  return high >= min && low <= max;
}

/** Checks whether the site responded recently enough to be considered "active" (Last-Modified / recent HTTP behavior). */
export async function isSiteActive(domain: string, maxAgeMonths = 6): Promise<boolean> {
  try {
    const res = await axios.head(`https://${domain}`, { timeout: 8000, validateStatus: () => true });
    const lastModified = res.headers['last-modified'];
    if (!lastModified) return true; // no signal => don't penalize
    const modifiedAt = new Date(lastModified as string);
    if (Number.isNaN(modifiedAt.getTime())) return true;
    const monthsAgo = (Date.now() - modifiedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsAgo <= maxAgeMonths;
  } catch (err) {
    log.warn(`site activity check failed for ${domain}: ${errorMessage(err)}`);
    return true; // fail open — don't drop a lead over a network hiccup
  }
}
