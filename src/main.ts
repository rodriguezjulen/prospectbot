import { createLogger } from './logger';
import { config } from './config';
import { runPipeline, shutdown } from './pipeline';
import { scheduleWeeklyRun } from './jobs/weeklyRun';
import { errorMessage } from './utils';

const log = createLogger('main');

async function main(): Promise<void> {
  const runOnce = process.argv.includes('--once');

  log.info('ProspectBot starting', { mockMode: config.mockMode, runOnce });

  if (runOnce) {
    try {
      const result = await runPipeline();
      log.info('one-off run complete', result as unknown as Record<string, unknown>);
    } finally {
      await shutdown();
    }
    return;
  }

  scheduleWeeklyRun();
  if (config.runOnStart) {
    log.info('RUN_ON_START=true — running pipeline immediately');
    await runPipeline().catch((err) => log.error(`initial run failed: ${errorMessage(err)}`));
  }
  log.info('ProspectBot running. Waiting for scheduled runs (Ctrl+C to stop).');
}

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down');
  await shutdown();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down');
  await shutdown();
  process.exit(0);
});

main().catch(async (err) => {
  log.error(`fatal error: ${errorMessage(err)}`);
  await shutdown();
  process.exitCode = 1;
});
