import axios from 'axios';
import { config, isLemlistConfigured } from '../config';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';
import type { LeadRow } from '../db/models';

const log = createLogger('export:lemlist');

function weekLabel(date = new Date()): string {
  const onejan = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${week}`;
}

/**
 * Creates/reuses a campaign named "<prefix>_<week>" and adds leads to it via Lemlist API.
 * No-ops (returns 0) when LEMLIST_API_KEY isn't set — sync is optional per spec.
 */
export async function syncToLemlist(rows: LeadRow[]): Promise<number> {
  if (!isLemlistConfigured()) {
    log.info('LEMLIST_API_KEY not set — skipping Lemlist sync (optional step)');
    return 0;
  }

  const campaignName = `${config.lemlistCampaignPrefix}_${weekLabel()}`;
  const auth = { username: '', password: config.lemlistApiKey };
  let synced = 0;

  try {
    const { data: campaigns } = await axios.get('https://api.lemlist.com/api/campaigns', { auth, timeout: 10_000 });
    let campaignId: string | undefined = Array.isArray(campaigns)
      ? campaigns.find((c: { name?: string }) => c.name === campaignName)?._id
      : undefined;

    if (!campaignId) {
      const { data: created } = await axios.post(
        'https://api.lemlist.com/api/campaigns',
        { name: campaignName },
        { auth, timeout: 10_000 }
      );
      campaignId = created?._id;
    }

    if (!campaignId) {
      log.error('could not resolve or create Lemlist campaign id');
      return 0;
    }

    for (const row of rows) {
      try {
        await axios.post(
          `https://api.lemlist.com/api/campaigns/${campaignId}/leads/${encodeURIComponent(row.email)}`,
          { firstName: row.first_name, companyName: row.company, jobTitle: row.job_title, tags: ['auto_generated'] },
          { auth, timeout: 10_000 }
        );
        synced++;
      } catch (err) {
        log.error(`failed to sync lead ${row.email} to Lemlist: ${errorMessage(err)}`);
      }
    }
  } catch (err) {
    log.error(`Lemlist campaign setup failed: ${errorMessage(err)}`);
    return synced;
  }

  log.info(`synced ${synced}/${rows.length} leads to Lemlist campaign "${campaignName}"`);
  return synced;
}
