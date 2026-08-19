import axios from 'axios';
import { config, isGoogleConfigured } from '../config';
import { createLogger } from '../logger';
import { normalizeDomain, tldOf, sleep } from '../utils';
import type { ScrapedCompany } from '../db/models';

const log = createLogger('scraper:google');

interface GoogleSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

const MOCK_COMPANIES: Array<{ name: string; domain: string }> = [
  { name: 'Nordic Byte', domain: 'nordicbyte.io' },
  { name: 'Vertex Analytics', domain: 'vertexanalytics.es' },
  { name: 'CloudPine Systems', domain: 'cloudpine.com' },
  { name: 'DataForge Labs', domain: 'dataforgelabs.io' },
  { name: 'PixelCraft Studio', domain: 'pixelcraft.eu' },
  { name: 'Quanta Works', domain: 'quantaworks.com' },
  { name: 'Solstice Robotics', domain: 'solsticerobotics.io' },
  { name: 'BrightLoop Tech', domain: 'brightloop.es' },
  { name: 'Nimbus Stack', domain: 'nimbusstack.com' },
  { name: 'Iron Compass', domain: 'ironcompass.eu' },
];

function mockSearch(limit: number): ScrapedCompany[] {
  log.warn('running in MOCK mode (no Google API credentials) — using sample company list');
  return MOCK_COMPANIES.slice(0, limit).map((c) => ({
    company_name: c.name,
    domain: c.domain,
    source: 'mock_data',
    found_at: new Date().toISOString(),
  }));
}

function companyNameFromTitle(title: string): string {
  return title.split(/[-|–—]/)[0]?.trim() || title.trim();
}

async function searchOneKeyword(keyword: string, country: string, remaining: number): Promise<ScrapedCompany[]> {
  const results: ScrapedCompany[] = [];
  let start = 1;
  while (results.length < remaining && start <= 91) {
    const { data } = await axios.get<GoogleSearchResponse>('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: config.googleApiKey,
        cx: config.googleCseId,
        q: `${keyword} ${country}`,
        start,
        num: 10,
      },
      timeout: 10_000,
    });
    const items = data.items ?? [];
    if (items.length === 0) break;
    for (const item of items) {
      const link = item.link ?? item.displayLink;
      if (!link) continue;
      const domain = normalizeDomain(link);
      if (!domain) continue;
      if (!config.allowedTlds.includes(tldOf(domain))) continue;
      results.push({
        company_name: companyNameFromTitle(item.title ?? domain),
        domain,
        source: 'google_search',
        found_at: new Date().toISOString(),
      });
    }
    start += 10;
    await sleep(config.requestDelayMs);
  }
  return results;
}

/** Searches configured keywords via Google Custom Search, dedupes by domain, filters by allowed TLDs. */
export async function scrapeCompanies(): Promise<ScrapedCompany[]> {
  if (!isGoogleConfigured()) {
    return mockSearch(config.searchLimit);
  }

  const byDomain = new Map<string, ScrapedCompany>();
  for (const keyword of config.searchKeywords) {
    if (byDomain.size >= config.searchLimit) break;
    try {
      const remaining = config.searchLimit - byDomain.size;
      const found = await searchOneKeyword(keyword, config.searchCountry, remaining);
      for (const company of found) {
        if (!byDomain.has(company.domain)) byDomain.set(company.domain, company);
      }
    } catch (err) {
      log.error(`google search failed for keyword "${keyword}"`, err);
    }
  }
  log.info(`scraped ${byDomain.size} unique companies`);
  return Array.from(byDomain.values());
}
