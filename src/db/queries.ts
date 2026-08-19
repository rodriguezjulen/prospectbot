import { pool } from './pool';
import { createLogger } from '../logger';
import type { CampaignExportRecord, CompanyRecord, ContactRecord, EnrichedCompany, ExportStatus, ValidatedContact } from './models';

const log = createLogger('db:queries');

/** Insert or update a company by domain (idempotent — no duplicates). */
export async function upsertCompany(company: EnrichedCompany): Promise<CompanyRecord> {
  const { rows } = await pool.query<CompanyRecord>(
    `INSERT INTO companies (name, domain, country, size_range, tech_stack, funding_stage)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (domain) DO UPDATE SET
       name = EXCLUDED.name,
       country = EXCLUDED.country,
       size_range = EXCLUDED.size_range,
       tech_stack = EXCLUDED.tech_stack,
       funding_stage = EXCLUDED.funding_stage,
       updated_at = NOW()
     RETURNING *`,
    [company.company_name, company.domain, company.country, company.size_range, company.tech_stack, company.funding_stage]
  );
  const row = rows[0];
  if (!row) throw new Error(`upsertCompany: no row returned for domain ${company.domain}`);
  return row;
}

/** Insert a contact if the email doesn't already exist. Returns null on duplicate. */
export async function insertContactIfNew(companyId: string, contact: ValidatedContact): Promise<ContactRecord | null> {
  try {
    const { rows } = await pool.query<ContactRecord>(
      `INSERT INTO contacts (company_id, email, job_title, confidence_score, source, validated)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [companyId, contact.email, contact.job_title, contact.confidence, 'hunter_io', contact.verified]
    );
    return rows[0] ?? null;
  } catch (err) {
    log.error(`failed inserting contact ${contact.email}`, err);
    return null;
  }
}

export async function recordExport(csvPath: string, contactCount: number, filters: Record<string, unknown>, status: ExportStatus): Promise<CampaignExportRecord> {
  const { rows } = await pool.query<CampaignExportRecord>(
    `INSERT INTO campaign_exports (contact_count, csv_path, filters_applied, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [contactCount, csvPath, JSON.stringify(filters), status]
  );
  const row = rows[0];
  if (!row) throw new Error('recordExport: no row returned');
  return row;
}

export async function getValidatedContactsForExport(minConfidence = 60): Promise<Array<ContactRecord & { company_name: string; domain: string; country: string | null }>> {
  const { rows } = await pool.query(
    `SELECT c.*, co.name AS company_name, co.domain, co.country
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     WHERE c.confidence_score >= $1
     ORDER BY c.created_at DESC`,
    [minConfidence]
  );
  return rows;
}
