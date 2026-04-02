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
    const { getAuthenticatedContext } = await import('../scraper/facebook/auth.js');
    const { scrapeGroups } = await import('../scraper/facebook/groupScraper.js');

    const groups = config.facebook.groups;
    if (groups.length === 0) {
      state.status = 'error';
      state.error = 'No Facebook groups configured';
      state.finishedAt = new Date().toISOString();
      return;
    }

    console.log(`[Scan] Starting scan of ${groups.length} groups...`);
    const { browser: b, context } = await getAuthenticatedContext();
    browser = b;

    const { listings, aliveHashes } = await scrapeGroups(context, groups);

    // 1. Process new listings through pipeline
    const pipelineResult = await runPipeline(listings);

    // 2. Touch all still-visible posts (update last_seen_at)
    const touched = touchListingsByHash(aliveHashes);
    console.log(`[Scan] Touched ${touched} existing listings as still alive (${aliveHashes.length} hashes)`);

    // 3. Deactivate listings not seen in the last 48 hours
    const deactivated = deactivateStaleListings(48);
    if (deactivated > 0) {
      console.log(`[Scan] Deactivated ${deactivated} stale listings`);
    }

    state.stats = { ...pipelineResult, deactivated };
    state.status = 'done';
    state.finishedAt = new Date().toISOString();
    console.log(`[Scan] Done: ${pipelineResult.added} added, ${pipelineResult.skipped} skipped, ${deactivated} deactivated`);

    // Send Telegram notifications for new listings
    if (config.telegram.botToken && pipelineResult.added > 0) {
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
