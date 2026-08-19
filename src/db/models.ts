export interface CompanyRecord {
  id: string;
  name: string;
  domain: string;
  country: string | null;
  size_range: string | null;
  tech_stack: string[];
  funding_stage: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRecord {
  id: string;
  company_id: string;
  email: string;
  job_title: string | null;
  confidence_score: number;
  source: string;
  validated: boolean;
  created_at: string;
  emailed_at: string | null;
  email_status: string | null;
}

export type ExportStatus = 'pending' | 'completed' | 'failed';

export interface CampaignExportRecord {
  id: string;
  export_date: string;
  contact_count: number;
  csv_path: string;
  filters_applied: Record<string, unknown>;
  status: ExportStatus;
}

/** In-memory shape used while the pipeline runs, before DB persistence. */
export interface ScrapedCompany {
  company_name: string;
  domain: string;
  source: string;
  found_at: string;
}

export interface ValidatedContact {
  domain: string;
  email: string;
  job_title: string;
  confidence: number;
  verified: boolean;
}

export interface EnrichedCompany extends ScrapedCompany {
  size_range: string;
  tech_stack: string[];
  funding_stage: string;
  country: string;
}

export interface LeadRow {
  email: string;
  first_name: string;
  company: string;
  job_title: string;
  country: string;
}
