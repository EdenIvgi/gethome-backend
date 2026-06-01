import { config } from '../config.js';
import { runPipeline } from '../pipeline/index.js';
import { touchListingsByHash, deleteStaleListings, pruneSeenPosts } from '../db/queries.js';
import { runMatchingPass } from '../notifications/matchingEngine.js';

/**
 * runScan — orchestrates a single end-to-end scrape cycle.
 *
 * Used by:
 *   - scripts/scrape-once.js (GHA cron entry point)
 *   - manual invocation during local development
 *
 * Yad2 and Facebook run in PARALLEL — they hit unrelated domains, use
 * separate Playwright browsers, and the GHA runner has plenty of RAM.
 *
 * Steps:
 *   1. Yad2 + Facebook in parallel → each scrape → pipeline → DB
 *   2. After both finish: touch alive FB hashes
 *   3. Hard-delete listings unseen for the cleanup window
 *   4. Prune seen_posts older than 30 days
 *   5. Match pass → Telegram notifications
 */
export async function runScan({ skipFacebook = false, skipYad2 = false } = {}) {
  const stats = { added: 0, skipped: 0, errors: 0, deactivated: 0, pruned: 0, notified: { perUser: 0, channel: 0 } };
  const startedAt = new Date();
  let fbBrowser; // captured so we can close it in finally

  // ---- Build the two tasks (each is a Promise) ----
  const yad2Task = skipYad2
    ? Promise.resolve({ added: 0, skipped: 0, errors: 0 })
    : (async () => {
        console.log('[Scan] Yad2 scrape (parallel) ...');
        try {
          const { scrapeYad2 } = await import('../scraper/yad2/scraper.js');
          const listings = await scrapeYad2();
          if (listings.length === 0) {
            console.log('[Scan] Yad2: 0 listings');
            return { added: 0, skipped: 0, errors: 0 };
          }
          const r = await runPipeline(listings);
          console.log(`[Scan] Yad2: ${r.added} added, ${r.skipped} skipped`);
          return r;
        } catch (err) {
          console.error('[Scan] Yad2 error:', err.message);
          return { added: 0, skipped: 0, errors: 1 };
        }
      })();

  const fbTask = (skipFacebook || config.facebook.groups.length === 0)
    ? Promise.resolve({ added: 0, skipped: 0, errors: 0, aliveHashes: [] })
    : (async () => {
        const groups = config.facebook.groups;
        console.log(`[Scan] Facebook scrape (parallel) of ${groups.length} groups ...`);
        try {
          const { getAuthenticatedContext } = await import('../scraper/facebook/auth.js');
          const { scrapeGroups } = await import('../scraper/facebook/groupScraper.js');

          const auth = await getAuthenticatedContext();
          fbBrowser = auth.browser;

          // Aggregate result for the final log line.
          const agg = { added: 0, skipped: 0, errors: 0 };
          let groupsDone = 0;

          // Insert each group's listings as soon as it finishes. Critical for
          // surviving GHA timeouts — without this, a single workflow cancellation
          // throws away 20+ minutes of scraping.
          const { aliveHashes } = await scrapeGroups(auth.context, groups, async (groupListings) => {
            groupsDone++;
            if (groupListings.length === 0) return;
            try {
              const r = await runPipeline(groupListings);
              agg.added += r.added;
              agg.skipped += r.skipped;
              agg.errors += r.errors;
              console.log(`[Scan] FB group #${groupsDone}/${groups.length}: +${r.added} added (FB total so far: ${agg.added})`);
            } catch (err) {
              console.error(`[Scan] FB group pipeline error: ${err.message}`);
              agg.errors++;
            }
          });

          console.log(`[Scan] FB final: ${agg.added} added across ${groupsDone} groups`);
          return { ...agg, aliveHashes };
        } catch (err) {
          console.error('[Scan] FB error:', err.message);
          return { added: 0, skipped: 0, errors: 1, aliveHashes: [] };
        }
      })();

  try {
    // Run both sources in parallel
    const [yad2Result, fbResult] = await Promise.allSettled([yad2Task, fbTask]);

    for (const r of [yad2Result, fbResult]) {
      if (r.status === 'fulfilled' && r.value) {
        stats.added += r.value.added || 0;
        stats.skipped += r.value.skipped || 0;
        stats.errors += r.value.errors || 0;
      } else if (r.status === 'rejected') {
        stats.errors++;
        console.error('[Scan] Task rejected:', r.reason?.message);
      }
    }

    // Touch alive FB hashes (after pipeline finished so insertions exist)
    if (fbResult.status === 'fulfilled' && fbResult.value.aliveHashes?.length > 0) {
      try {
        const touched = await touchListingsByHash(fbResult.value.aliveHashes);
        console.log(`[Scan] Touched ${touched} existing FB listings`);
      } catch (err) {
        console.error('[Scan] Touch error:', err.message);
      }
    }

    // Hard-delete stale
    try {
      stats.deactivated = await deleteStaleListings(config.cleanup.staleMaxHours);
      if (stats.deactivated > 0) console.log(`[Scan] Hard-deleted ${stats.deactivated} stale listings (${config.cleanup.staleMaxHours}h cutoff)`);
    } catch (err) {
      console.error('[Scan] Stale cleanup error:', err.message);
    }

    // Prune seen_posts
    try {
      stats.pruned = await pruneSeenPosts(30);
      if (stats.pruned > 0) console.log(`[Scan] Pruned ${stats.pruned} seen_posts`);
    } catch (err) {
      console.error('[Scan] Seen prune error:', err.message);
    }

    // Match + notify
    if (config.telegram.botToken) {
      try {
        stats.notified = await runMatchingPass();
      } catch (err) {
        console.error('[Scan] Match/notify error:', err.message);
      }
    }
  } finally {
    if (fbBrowser) await fbBrowser.close().catch(() => {});
  }

  const durationSec = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`[Scan] Done in ${durationSec}s: added=${stats.added} skipped=${stats.skipped} errors=${stats.errors} deleted=${stats.deactivated} pruned=${stats.pruned} notified=${JSON.stringify(stats.notified)}`);
  return stats;
}
