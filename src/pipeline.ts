import { createLogger } from './logger';
import { config } from './config';
import { errorMessage } from './utils';
import { scrapeCompanies } from './scraper/googleSearch';
import { validateEmails } from './validator/hunterApi';
import { isValidEmailFormat, isDisposableDomain, hasMxRecord } from './validator/emailChecker';
import { estimateSizeRange, bucketWithinRange, isSiteActive } from './filters/companySize';
import { detectTechStack } from './filters/techStack';
import { generateCsv } from './export/csvGenerator';
import { syncToLemlist } from './export/lemlistSync';
import { notifyTelegram } from './notify/telegram';
import { pingDb, pool } from './db/pool';
import { upsertCompany, insertContactIfNew, recordExport } from './db/queries';
import { firstNameFromEmail } from './utils';
import type { EnrichedCompany, LeadRow, ValidatedContact } from './db/models';

const log = createLogger('pipeline');

export interface PipelineResult {
  companiesScraped: number;
  contactsValidated: number;
  leadsFiltered: number;
  newContactsInserted: number;
  csvPath: string | null;
  lemlistSynced: number;
}

async function enrichCompany(domain: string, name: string, source: string, foundAt: string): Promise<EnrichedCompany> {
  const [techStack, active] = await Promise.all([
    detectTechStack(domain, config.focusTechStack),
    isSiteActive(domain),
  ]);
  return {
    company_name: name,
    domain,
    source,
    found_at: foundAt,
    size_range: estimateSizeRange(domain),
    tech_stack: techStack,
    funding_stage: 'unknown',
    country: config.searchCountry,
  };
}

async function validContact(c: ValidatedContact): Promise<boolean> {
  if (!isValidEmailFormat(c.email)) return false;
  if (isDisposableDomain(c.email)) return false;
  return hasMxRecord(c.email);
}

/** Runs the full weekly pipeline: scrape -> validate -> filter -> persist -> export -> sync -> notify. */
export async function runPipeline(): Promise<PipelineResult> {
  log.info('pipeline run started', { mockMode: config.mockMode });

  const dbUp = await pingDb();
  if (!dbUp) {
    log.warn('database unreachable — pipeline will run but skip persistence');
  }

  const scraped = await scrapeCompanies();
  log.info(`scraped ${scraped.length} companies`);

  const domains = scraped.map((c) => c.domain);
  const rawContacts = await validateEmails(domains);
  log.info(`validated ${rawContacts.length} raw contacts`);

  const goodContacts: ValidatedContact[] = [];
  for (const c of rawContacts) {
    if (await validContact(c)) goodContacts.push(c);
  }
  log.info(`${goodContacts.length}/${rawContacts.length} contacts passed format/MX checks`);

  const byDomain = new Map(scraped.map((c) => [c.domain, c]));
  const leadRows: LeadRow[] = [];
  let newContactsInserted = 0;

  for (const contact of goodContacts) {
    const source = byDomain.get(contact.domain);
    if (!source) continue;

    const enriched = await enrichCompany(source.domain, source.company_name, source.source, source.found_at);
    const sizeOk = bucketWithinRange(estimateSizeRange(source.domain), config.minCompanySize, config.maxCompanySize);
    if (!sizeOk) continue;

    if (dbUp) {
      try {
        const companyRow = await upsertCompany(enriched);
        const inserted = await insertContactIfNew(companyRow.id, contact);
        if (inserted) newContactsInserted++;
      } catch (err) {
        log.error(`persistence failed for ${contact.domain}: ${errorMessage(err)}`);
      }
    }

    leadRows.push({
      email: contact.email,
      first_name: firstNameFromEmail(contact.email),
      company: enriched.company_name,
      job_title: contact.job_title,
      country: enriched.country,
    });
  }

  log.info(`${leadRows.length} leads passed all filters`);

  let csvPath: string | null = null;
  let lemlistSynced = 0;
  if (leadRows.length > 0) {
    csvPath = generateCsv(leadRows);
    lemlistSynced = await syncToLemlist(leadRows);
    if (dbUp) {
      try {
        await recordExport(csvPath, leadRows.length, {
          minCompanySize: config.minCompanySize,
          maxCompanySize: config.maxCompanySize,
          focusTechStack: config.focusTechStack,
        }, 'completed');
      } catch (err) {
        log.error(`failed to record export in db: ${errorMessage(err)}`);
      }
    }
  } else {
    log.warn('no leads passed filters — skipping CSV export');
  }

  const summary = `✅ ProspectBot: ${leadRows.length} nuevos leads generados` +
    (csvPath ? ` (${csvPath})` : '') +
    (lemlistSynced ? `. ${lemlistSynced} sincronizados a Lemlist.` : '.');
  await notifyTelegram(summary);
  log.info('pipeline run finished', { summary });

  return {
    companiesScraped: scraped.length,
    contactsValidated: goodContacts.length,
    leadsFiltered: leadRows.length,
    newContactsInserted,
    csvPath,
    lemlistSynced,
  };
}

export async function shutdown(): Promise<void> {
  await pool.end().catch(() => undefined);
}
