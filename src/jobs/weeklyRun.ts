import cron from 'node-cron';
import { config } from '../config';
import { createLogger } from '../logger';
import { runPipeline } from '../pipeline';
import { errorMessage } from '../utils';

const log = createLogger('jobs:weekly');

let running = false;

async function safeRun(): Promise<void> {
  if (running) {
    log.warn('previous run still in progress — skipping this trigger to avoid overlap');
    return;
  }
  running = true;
  try {
    await runPipeline();
  } catch (err) {
    log.error(`weekly run failed: ${errorMessage(err)}`);
  } finally {
    running = false;
  }
}

/** Schedules the weekly pipeline run (default: Monday 09:00 UTC, see CRON_SCHEDULE). */
export function scheduleWeeklyRun(): void {
  if (!cron.validate(config.cronSchedule)) {
    log.error(`invalid CRON_SCHEDULE "${config.cronSchedule}" — falling back to default '0 9 * * 1'`);
    cron.schedule('0 9 * * 1', safeRun, { timezone: 'UTC' });
    return;
  }
  log.info(`scheduling weekly run: "${config.cronSchedule}" (UTC)`);
  cron.schedule(config.cronSchedule, safeRun, { timezone: 'UTC' });
}
