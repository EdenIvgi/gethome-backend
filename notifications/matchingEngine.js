import {
  getUnnotifiedListings,
  getAllActivePreferences,
  logNotification,
  isNotificationSent,
  markListingsNotified,
} from '../db/queries.js';
import { listingMatchesPreference } from '../scraper/yad2/urlBuilder.js';
import { notifyUserOfListing } from './telegram.js';
import { config } from '../config.js';

/**
 * Post-scrape matching pass.
 * Replaces the old in-process matchAndNotify(listing) that ran during live polling.
 *
 * For each unnotified listing:
 *   1. Find all user preferences that match.
 *   2. Send Telegram notification to each matching user (per-user notify).
 *   3. Log the notification so we don't repeat next run.
 *
 * Then marks all the processed listings as globally notified (sets notified_at),
 * which is what notifyNewListings() in telegram.js uses for the channel-wide feed.
 */
export async function runMatchingPass() {
  const [listings, prefs] = await Promise.all([
    getUnnotifiedListings(),
    getAllActivePreferences(),
  ]);

  if (listings.length === 0) {
    console.log('[Match] No new listings to process');
    return { perUser: 0, channel: 0 };
  }

  let perUserNotified = 0;

  if (prefs.length > 0) {
    for (const listing of listings) {
      for (const pref of prefs) {
        if (pref.source !== 'all' && pref.source !== listing.source) continue;
        if (!listingMatchesPreference(listing, pref)) continue;
        if (!pref.telegram_chat_id) continue;
        if (await isNotificationSent(pref.user_id, listing.id, 'telegram')) continue;

        try {
          await notifyUserOfListing(pref.telegram_chat_id, listing);
          await logNotification(pref.user_id, listing.id, 'telegram');
          perUserNotified++;
        } catch (err) {
          console.error(`[Match] notify user=${pref.user_id} listing=${listing.id}: ${err.message}`);
        }
      }
    }
    console.log(`[Match] Per-user notifications sent: ${perUserNotified}`);
  }

  // Channel-wide notifications (single TELEGRAM_CHAT_ID), if configured.
  // The legacy notifyNewListings() in telegram.js handles this and also sets
  // notified_at to prevent re-notification.
  let channelNotified = 0;
  if (config.telegram.botToken && config.telegram.chatId) {
    const { notifyNewListings } = await import('./telegram.js');
    channelNotified = await notifyNewListings();
  } else {
    // No channel configured – still mark listings as notified so we don't
    // re-process them every run.
    const ids = listings.map(l => l.id);
    if (ids.length > 0) await markListingsNotified(ids);
  }

  return { perUser: perUserNotified, channel: channelNotified };
}
