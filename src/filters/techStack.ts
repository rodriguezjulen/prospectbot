import axios from 'axios';
import * as cheerio from 'cheerio';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('filters:techstack');

/** Fetches the homepage and returns which of the focus tech-stack keywords appear in its text/HTML. */
export async function detectTechStack(domain: string, focusStack: string[]): Promise<string[]> {
  try {
    const { data } = await axios.get<string>(`https://${domain}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'ProspectBot/1.0 (+lead research; contact via site)' },
    });
    const $ = cheerio.load(data);
    const text = `${$('body').text()} ${data}`.toLowerCase();
    return focusStack.filter((tech) => text.includes(tech.toLowerCase()));
  } catch (err) {
    log.warn(`tech-stack detection failed for ${domain}: ${errorMessage(err)}`);
    return [];
  }
}

const FUNDING_SIGNALS: Array<{ pattern: RegExp; stage: string }> = [
  { pattern: /pre-seed/i, stage: 'pre-seed' },
  { pattern: /seed round|seed funding/i, stage: 'seed' },
  { pattern: /series a/i, stage: 'series-a' },
  { pattern: /series b/i, stage: 'series-b' },
  { pattern: /bootstrap(ped)?/i, stage: 'bootstrapped' },
];

/** Best-effort funding-stage guess from homepage copy (press/about sections often mention it). Defaults to 'unknown'. */
export function guessFundingStage(pageText: string): string {
  for (const { pattern, stage } of FUNDING_SIGNALS) {
    if (pattern.test(pageText)) return stage;
  }
  return 'unknown';
}
