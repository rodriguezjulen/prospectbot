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

export interface LeadListItem extends ContactRecord {
  company_name: string;
  domain: string;
  country: string | null;
  tech_stack: string[];
  size_range: string | null;
}

/** All contacts for the dashboard, most recent first, with a search filter on email/company/domain. */
export async function listLeads(search: string, limit: number, offset: number): Promise<{ rows: LeadListItem[]; total: number }> {
  const like = `%${search.trim()}%`;
  const { rows } = await pool.query<LeadListItem>(
    `SELECT c.*, co.name AS company_name, co.domain, co.country, co.tech_stack, co.size_range
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     WHERE $1 = '' OR c.email ILIKE $2 OR co.name ILIKE $2 OR co.domain ILIKE $2
     ORDER BY c.created_at DESC
     LIMIT $3 OFFSET $4`,
    [search.trim(), like, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     WHERE $1 = '' OR c.email ILIKE $2 OR co.name ILIKE $2 OR co.domain ILIKE $2`,
    [search.trim(), like]
  );
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

export interface DashboardStats {
  totalCompanies: number;
  totalContacts: number;
  lastExport: CampaignExportRecord | null;
  exportsHistory: CampaignExportRecord[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [{ rows: companyCount }, { rows: contactCount }, { rows: exports }] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM companies'),
    pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM contacts'),
    pool.query<CampaignExportRecord>('SELECT * FROM campaign_exports ORDER BY export_date DESC LIMIT 10'),
  ]);
  return {
    totalCompanies: Number(companyCount[0]?.count ?? 0),
    totalContacts: Number(contactCount[0]?.count ?? 0),
    lastExport: exports[0] ?? null,
    exportsHistory: exports,
  };
}

export interface ContactForEmail extends ContactRecord {
  company_name: string;
  domain: string;
  tech_stack: string[];
}

/** Contacts never emailed yet, oldest-first, capped by limit (daily send cap). */
export async function getContactsPendingEmail(limit: number): Promise<ContactForEmail[]> {
  const { rows } = await pool.query<ContactForEmail>(
    `SELECT c.*, co.name AS company_name, co.domain, co.tech_stack
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     WHERE c.emailed_at IS NULL
     ORDER BY c.created_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function markContactEmailed(contactId: string, status: 'sent' | 'failed'): Promise<void> {
  await pool.query(
    `UPDATE contacts SET emailed_at = NOW(), email_status = $2, last_contacted_at = NOW() WHERE id = $1`,
    [contactId, status]
  );
}

export interface ContactForFollowUp extends ContactRecord {
  company_name: string;
  domain: string;
}

/** Contacts emailed but never replied, ready for next follow-up (delay elapsed, under max count). */
export async function getContactsPendingFollowUp(delayDays: number, maxFollowUps: number, limit: number): Promise<ContactForFollowUp[]> {
  const { rows } = await pool.query<ContactForFollowUp>(
    `SELECT c.*, co.name AS company_name, co.domain
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     WHERE c.emailed_at IS NOT NULL
       AND c.replied_at IS NULL
       AND c.follow_up_count < $2
       AND c.last_contacted_at < NOW() - ($1 || ' days')::INTERVAL
     ORDER BY c.last_contacted_at ASC
     LIMIT $3`,
    [delayDays, maxFollowUps, limit]
  );
  return rows;
}

export async function markContactFollowedUp(contactId: string, status: 'sent' | 'failed'): Promise<void> {
  await pool.query(
    `UPDATE contacts SET follow_up_count = follow_up_count + 1, last_contacted_at = NOW(), email_status = $2 WHERE id = $1`,
    [contactId, status]
  );
}

/** Marks a contact as replied (called by inbox tracker) with a short preview of their reply. */
export async function markContactReplied(email: string, snippet: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE contacts SET replied_at = NOW(), reply_snippet = $2 WHERE email = $1 AND replied_at IS NULL RETURNING id`,
    [email, snippet]
  );
  return rows[0]?.id ?? null;
}

export interface ContactForAiReply extends ContactRecord {
  company_name: string;
  domain: string;
}

/** Contacts who replied and have no AI draft/send yet. */
export async function getContactsPendingAiReply(limit: number): Promise<ContactForAiReply[]> {
  const { rows } = await pool.query<ContactForAiReply>(
    `SELECT c.*, co.name AS company_name, co.domain
     FROM contacts c
     JOIN companies co ON co.id = c.company_id
     WHERE c.replied_at IS NOT NULL AND c.ai_reply_sent_at IS NULL AND c.ai_reply_draft IS NULL
     ORDER BY c.replied_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function saveAiReplyDraft(contactId: string, draft: string): Promise<void> {
  await pool.query(`UPDATE contacts SET ai_reply_draft = $2 WHERE id = $1`, [contactId, draft]);
}

export async function markAiReplySent(contactId: string): Promise<void> {
  await pool.query(`UPDATE contacts SET ai_reply_sent_at = NOW() WHERE id = $1`, [contactId]);
}
