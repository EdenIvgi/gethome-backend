import cron from 'node-cron';
import { config } from '../config.js';
import { startScan } from './scanManager.js';
import { deactivateStaleListings } from '../db/queries.js';

// Facebook: every 30 minutes (only if configured)
cron.schedule('*/30 * * * *', () => {
  if (config.facebook.groups.length === 0) return;
  console.log(`[${new Date().toISOString()}] Scheduled Facebook scrape...`);
  startScan();
});

// Telegram notification fallback: check for unnotified listings every 30 min
cron.schedule('*/30 * * * *', async () => {
  if (!config.telegram.botToken) return;
  try {
    const { notifyNewListings } = await import('../notifications/telegram.js');
    await notifyNewListings();
  } catch (err) {
    console.error('Notification check error:', err.message);
  }
});

// Cleanup: deactivate stale listings periodically
cron.schedule(config.cleanup.intervalCron, () => {
  console.log(`[${new Date().toISOString()}] Running stale listing cleanup...`);
  const deactivated = deactivateStaleListings(config.cleanup.staleMaxHours);
  if (deactivated > 0) {
    console.log(`[Cleanup] Deactivated ${deactivated} stale listings`);
  }
});

console.log('Scheduler initialized: Facebook (*/30), Telegram (*/30), Cleanup (' + config.cleanup.intervalCron + ').');
