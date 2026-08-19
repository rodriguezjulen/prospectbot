import { pool } from './pool';
import { createLogger } from '../logger';

const log = createLogger('db:init');

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  country VARCHAR(100),
  size_range VARCHAR(50),
  tech_stack TEXT[] DEFAULT '{}',
  funding_stage VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  job_title VARCHAR(255),
  confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  source VARCHAR(100),
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  emailed_at TIMESTAMP,
  email_status VARCHAR(50)
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_status VARCHAR(50);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS reply_snippet TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_reply_draft TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_reply_sent_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS campaign_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_date TIMESTAMP DEFAULT NOW(),
  contact_count INTEGER NOT NULL,
  csv_path VARCHAR(500) NOT NULL,
  filters_applied JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
`;

export async function initDb(): Promise<void> {
  log.info('creating schema if not exists');
  await pool.query(SCHEMA);
  log.info('schema ready');
}

if (require.main === module) {
  initDb()
    .then(() => {
      log.info('db:init complete');
      return pool.end();
    })
    .catch((err) => {
      log.error('db:init failed', err);
      process.exitCode = 1;
    });
}
