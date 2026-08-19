import { Telegraf } from 'telegraf';
import { config, isTelegramConfigured } from '../config';
import { createLogger } from '../logger';
import { errorMessage } from '../utils';

const log = createLogger('notify:telegram');

/** Sends a run summary to Telegram. No-ops silently when not configured (notifications are optional). */
export async function notifyTelegram(message: string): Promise<void> {
  if (!isTelegramConfigured()) {
    log.info('Telegram not configured — skipping notification');
    return;
  }
  try {
    const bot = new Telegraf(config.telegramBotToken);
    await bot.telegram.sendMessage(config.telegramChatId, message);
    log.info('Telegram notification sent');
  } catch (err) {
    log.error(`Telegram notification failed: ${errorMessage(err)}`);
  }
}
