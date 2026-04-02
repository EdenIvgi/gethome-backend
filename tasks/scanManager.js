import { config } from '../config.js';
import { runPipeline } from '../pipeline/index.js';
import { touchListingsByHash, deactivateStaleListings } from '../db/queries.js';

const state = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  stats: { added: 0, skipped: 0, errors: 0, deactivated: 0 },
  error: null,
};

export function getStatus() {
  return { ...state };
}

export function startScan() {
  if (state.status === 'scanning') {
    return { started: false, message: 'Scan already in progress' };
  }

  state.status = 'scanning';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.stats = { added: 0, skipped: 0, errors: 0 };
  state.error = null;

  runScan().catch(() => {});

  return { started: true, message: 'Scan started' };
}

async function runScan() {
  let browser;
  try {
    let totalAdded = 0, totalSkipped = 0, totalErrors = 0;

    // 1. Yad2 scrape (always available, no auth needed)
    try {
      console.log('[Scan] Starting Yad2 scrape...');
      const { scrapeYad2 } = await import('../scraper/yad2/scraper.js');
      const yad2Listings = await scrapeYad2();
      if (yad2Listings.length > 0) {
        const yad2Result = await runPipeline(yad2Listings);
        totalAdded += yad2Result.added;
        totalSkipped += yad2Result.skipped;
        totalErrors += yad2Result.errors;
        console.log(`[Scan] Yad2: ${yad2Result.added} added, ${yad2Result.skipped} skipped`);
      } else {
        console.log('[Scan] Yad2: no listings returned');
      }
    } catch (err) {
      console.error('[Scan] Yad2 error:', err.message);
      state.error = `Yad2: ${err.message}`;
      totalErrors++;
    }

    // 2. Facebook scrape (only if groups configured)
    const groups = config.facebook.groups;
    if (groups.length > 0) {
      try {
        console.log(`[Scan] Starting Facebook scan of ${groups.length} groups...`);
        const { getAuthenticatedContext } = await import('../scraper/facebook/auth.js');
        const { scrapeGroups } = await import('../scraper/facebook/groupScraper.js');

        const { browser: b, context } = await getAuthenticatedContext();
        browser = b;

        const { listings, aliveHashes } = await scrapeGroups(context, groups);
        const fbResult = await runPipeline(listings);
        totalAdded += fbResult.added;
        totalSkipped += fbResult.skipped;
        totalErrors += fbResult.errors;

        const touched = touchListingsByHash(aliveHashes);
        console.log(`[Scan] Facebook: ${fbResult.added} added, touched ${touched} existing`);
      } catch (err) {
        console.error('[Scan] Facebook error:', err.message);
        totalErrors++;
      }
    }

    // 3. Deactivate listings not seen in the last 48 hours
    const deactivated = deactivateStaleListings(48);
    if (deactivated > 0) {
      console.log(`[Scan] Deactivated ${deactivated} stale listings`);
    }

    state.stats = { added: totalAdded, skipped: totalSkipped, errors: totalErrors, deactivated };
    state.status = 'done';
    state.finishedAt = new Date().toISOString();
    console.log(`[Scan] Done: ${totalAdded} added, ${totalSkipped} skipped, ${deactivated} deactivated`);

    // Send Telegram notifications for new listings
    if (config.telegram.botToken && totalAdded > 0) {
      try {
        const { notifyNewListings } = await import('../notifications/telegram.js');
        const notified = await notifyNewListings();
        state.stats.notified = notified;
      } catch (err) {
        console.error('[Scan] Notification error:', err.message);
      }
    }
  } catch (err) {
    state.status = 'error';
    state.error = err.message;
    state.finishedAt = new Date().toISOString();
    console.error('[Scan] Error:', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
