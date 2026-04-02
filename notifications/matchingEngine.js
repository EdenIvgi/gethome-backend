import { getAllActivePreferences, isNotificationSent, logNotification } from '../db/queries.js';
import { listingMatchesPreference } from '../scraper/yad2/urlBuilder.js';
import { notifyUserOfListing } from './telegram.js';
import { pushToUser } from './sseManager.js';

// Cache preferences, refresh every 60s
let cachedPrefs = [];
let lastRefresh = 0;
const REFRESH_INTERVAL = 60_000;

function refreshPreferences() {
  const now = Date.now();
  if (now - lastRefresh > REFRESH_INTERVAL) {
    cachedPrefs = getAllActivePreferences();
    lastRefresh = now;
  }
  return cachedPrefs;
}

/**
 * When a new listing is found, check against all users' preferences
 * and send notifications to matching users.
 */
export function matchAndNotify(listing) {
  const prefs = refreshPreferences();
  if (prefs.length === 0) return;

  for (const pref of prefs) {
    // Check source filter
    if (pref.source !== 'all' && pref.source !== listing.source) continue;

    // Check if listing matches this preference
    if (!listingMatchesPreference(listing, pref)) continue;

    const userId = pref.user_id;

    // SSE notification (browser)
    if (!isNotificationSent(userId, listing.id, 'sse')) {
      try {
        pushToUser(userId, listing);
        logNotification(userId, listing.id, 'sse');
      } catch (err) {
        console.error(`[Match] SSE error for user ${userId}:`, err.message);
      }
    }

    // Telegram notification
    if (pref.telegram_chat_id) {
      if (!isNotificationSent(userId, listing.id, 'telegram')) {
        notifyUserOfListing(pref.telegram_chat_id, listing)
          .then(() => logNotification(userId, listing.id, 'telegram'))
          .catch((err) => console.error(`[Match] Telegram error for user ${userId}:`, err.message));
      }
    }
  }
}
