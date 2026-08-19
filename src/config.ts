import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function int(name: string, fallback: number): number {
  const v = parseInt(str(name), 10);
  return Number.isFinite(v) ? v : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = str(name).toLowerCase();
  if (v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

/** Accepts JSON array ('["a","b"]') or comma-separated list ('a,b'). */
function list(name: string, fallback: string[]): string[] {
  const raw = str(name);
  if (!raw) return fallback;
  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      // fall through to CSV parsing
    }
  }
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export interface AppConfig {
  databaseUrl: string;
  hunterApiKey: string;
  googleCseId: string;
  googleApiKey: string;
  lemlistApiKey: string;
  lemlistCampaignPrefix: string;
  telegramBotToken: string;
  telegramChatId: string;
  searchKeywords: string[];
  searchCountry: string;
  searchLimit: number;
  minCompanySize: number;
  maxCompanySize: number;
  focusTechStack: string[];
  allowedTlds: string[];
  cronSchedule: string;
  runOnStart: boolean;
  mockMode: boolean;
  requestDelayMs: number;
  hunterMaxSearchesPerRun: number;
  exportsDir: string;
  logsDir: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  emailFrom: string;
  emailFromName: string;
  emailSubject: string;
  emailReplyTo: string;
  emailUnsubscribeText: string;
  sendEmails: boolean;
  emailDailyLimit: number;
  emailDelayMs: number;
  anthropicApiKey: string;
  anthropicModel: string;
  resendApiKey: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapSecure: boolean;
  followUpDelayDays: number;
  followUpMax: number;
  autoReplyEnabled: boolean;
}

const hunterApiKey = str('HUNTER_API_KEY');
const googleCseId = str('GOOGLE_CSE_ID');
const googleApiKey = str('GOOGLE_API_KEY');

export const config: AppConfig = {
  databaseUrl: str('DATABASE_URL', 'postgresql://prospectbot:prospectbot@localhost:5432/prospectbot'),
  hunterApiKey,
  googleCseId,
  googleApiKey,
  lemlistApiKey: str('LEMLIST_API_KEY'),
  lemlistCampaignPrefix: str('LEMLIST_CAMPAIGN_PREFIX', 'ProspectBot'),
  telegramBotToken: str('TELEGRAM_BOT_TOKEN'),
  telegramChatId: str('TELEGRAM_CHAT_ID'),
  searchKeywords: list('SEARCH_KEYWORDS', ['startups Node.js', 'pymes Python AWS', 'tech entrepreneurs Spain']),
  searchCountry: str('SEARCH_COUNTRY', 'Spain'),
  searchLimit: int('SEARCH_LIMIT', 300),
  minCompanySize: int('MIN_COMPANY_SIZE', 10),
  maxCompanySize: int('MAX_COMPANY_SIZE', 500),
  focusTechStack: list('FOCUS_TECH_STACK', ['Node.js', 'Python', 'AWS', 'PostgreSQL']),
  allowedTlds: list('ALLOWED_TLDS', ['com', 'es', 'eu', 'io']).map((t) => t.replace(/^\./, '').toLowerCase()),
  cronSchedule: str('CRON_SCHEDULE', '0 9 * * 1'),
  runOnStart: bool('RUN_ON_START', false),
  // Mock mode is automatic when search or Hunter credentials are missing.
  mockMode: bool('MOCK_MODE', false) || !hunterApiKey || !googleCseId || !googleApiKey,
  requestDelayMs: int('REQUEST_DELAY_MS', 1500),
  hunterMaxSearchesPerRun: int('HUNTER_MAX_SEARCHES_PER_RUN', 25),
  exportsDir: path.resolve(process.cwd(), 'exports'),
  logsDir: path.resolve(process.cwd(), 'logs'),
  smtpHost: str('SMTP_HOST'),
  smtpPort: int('SMTP_PORT', 587),
  smtpUser: str('SMTP_USER'),
  smtpPass: str('SMTP_PASS'),
  smtpSecure: bool('SMTP_SECURE', false),
  emailFrom: str('EMAIL_FROM'),
  emailFromName: str('EMAIL_FROM_NAME', 'ProspectBot'),
  emailSubject: str('EMAIL_SUBJECT', 'Rápida pregunta sobre {{company}}'),
  emailReplyTo: str('EMAIL_REPLY_TO'),
  emailUnsubscribeText: str('EMAIL_UNSUBSCRIBE_TEXT', 'Si no quieres recibir más correos, responde con "BAJA".'),
  // Off by default — sending real cold emails is irreversible and must be an explicit choice.
  sendEmails: bool('SEND_EMAILS', false),
  emailDailyLimit: int('EMAIL_DAILY_LIMIT', 50),
  emailDelayMs: int('EMAIL_DELAY_MS', 3000),
  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  anthropicModel: str('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001'),
  resendApiKey: str('RESEND_API_KEY'),
  imapHost: str('IMAP_HOST'),
  imapPort: int('IMAP_PORT', 993),
  imapUser: str('IMAP_USER'),
  imapPass: str('IMAP_PASS'),
  imapSecure: bool('IMAP_SECURE', true),
  followUpDelayDays: int('FOLLOW_UP_DELAY_DAYS', 4),
  followUpMax: int('FOLLOW_UP_MAX', 2),
  // Off by default — auto-sending AI-drafted replies is irreversible and must be an explicit choice.
  autoReplyEnabled: bool('AUTO_REPLY_ENABLED', false),
};

export const isGoogleConfigured = (): boolean => !config.mockMode && !!config.googleCseId && !!config.googleApiKey;
export const isHunterConfigured = (): boolean => !config.mockMode && !!config.hunterApiKey;
export const isLemlistConfigured = (): boolean => !!config.lemlistApiKey;
export const isTelegramConfigured = (): boolean => !!config.telegramBotToken && !!config.telegramChatId;
export const isSmtpConfigured = (): boolean => !!config.smtpHost && !!config.smtpUser && !!config.smtpPass && !!config.emailFrom;
export const isResendConfigured = (): boolean => !!config.resendApiKey && !!config.emailFrom;
export const isEmailProviderConfigured = (): boolean => isResendConfigured() || isSmtpConfigured();
export const isImapConfigured = (): boolean => !!config.imapHost && !!config.imapUser && !!config.imapPass;
export const isAnthropicConfigured = (): boolean => !!config.anthropicApiKey;
