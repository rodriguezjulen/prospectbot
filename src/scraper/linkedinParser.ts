import { createLogger } from '../logger';

const log = createLogger('scraper:linkedin');

/**
 * LinkedIn scraping is prohibited by their Terms of Service.
 * This module intentionally does nothing beyond documenting that decision.
 * Company-size / tech-stack signals come instead from Hunter.io enrichment
 * and public website content — see filters/companySize.ts and filters/techStack.ts.
 */
export function assertLinkedInScrapingDisabled(): void {
  log.debug('LinkedIn scraping is disabled by design (ToS compliance)');
}
