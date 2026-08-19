import axios from 'axios';
import { config, isHunterConfigured } from '../config';
import { createLogger } from '../logger';
import { sleep, errorMessage } from '../utils';
import type { ValidatedContact } from '../db/models';

const log = createLogger('validator:hunter');

interface HunterEmailEntry {
  value: string;
  type: string;
  confidence: number;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
  verification?: { status?: string | null };
}

interface HunterDomainSearchResponse {
  data: {
    domain: string;
    emails: HunterEmailEntry[];
  };
}

const TITLE_PRIORITY: Array<{ pattern: RegExp; label: string; rank: number }> = [
  { pattern: /\bcto\b|chief technology/i, label: 'CTO', rank: 1 },
  { pattern: /engineering manager|head of engineering/i, label: 'Engineering Manager', rank: 2 },
  { pattern: /founder|co-founder/i, label: 'Founder', rank: 3 },
  { pattern: /ceo|chief executive/i, label: 'CEO', rank: 4 },
  { pattern: /lead developer|dev lead|tech lead/i, label: 'Dev Lead', rank: 5 },
];

function classifyTitle(position: string | null | undefined): { label: string; rank: number } {
  const text = position ?? '';
  for (const entry of TITLE_PRIORITY) {
    if (entry.pattern.test(text)) return { label: entry.label, rank: entry.rank };
  }
  return { label: position || 'Unknown', rank: 99 };
}

function mockContactsForDomain(domain: string): ValidatedContact[] {
  return [
    {
      domain,
      email: `cto@${domain}`,
      job_title: 'CTO',
      confidence: 92,
      verified: true,
    },
  ];
}

/** Queries Hunter.io domain-search for each domain, extracts + prioritizes contacts. Respects free-tier quota via HUNTER_MAX_SEARCHES_PER_RUN. */
export async function validateEmails(domains: string[]): Promise<ValidatedContact[]> {
  if (!isHunterConfigured()) {
    log.warn('running in MOCK mode (no Hunter API key) — generating sample contacts');
    return domains.flatMap(mockContactsForDomain);
  }

  const capped = domains.slice(0, config.hunterMaxSearchesPerRun);
  if (domains.length > capped.length) {
    log.warn(`domain list truncated to ${capped.length} to respect Hunter free-tier quota (had ${domains.length})`);
  }

  const results: ValidatedContact[] = [];
  for (const domain of capped) {
    try {
      const { data } = await axios.get<HunterDomainSearchResponse>('https://api.hunter.io/v2/domain-search', {
        params: { domain, api_key: config.hunterApiKey, limit: 10 },
        timeout: 10_000,
      });
      const emails = data.data?.emails ?? [];
      const ranked = emails
        .filter((e) => !!e.value)
        .map((e) => {
          const { label, rank } = classifyTitle(e.position);
          return { entry: e, label, rank };
        })
        .sort((a, b) => a.rank - b.rank || b.entry.confidence - a.entry.confidence);

      const best = ranked[0];
      if (best) {
        results.push({
          domain,
          email: best.entry.value,
          job_title: best.label,
          confidence: best.entry.confidence,
          verified: (best.entry.verification?.status ?? '') === 'valid',
        });
      }
    } catch (err) {
      log.error(`hunter domain-search failed for ${domain}: ${errorMessage(err)}`);
    }
    await sleep(config.requestDelayMs);
  }
  log.info(`validated ${results.length} contacts across ${capped.length} domains`);
  return results;
}
