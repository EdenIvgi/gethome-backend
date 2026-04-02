import axios from 'axios';
import { config } from '../config.js';
import { getUnnotifiedListings, markListingsNotified } from '../db/queries.js';

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;

async function sendTelegramMessage(text) {
  await axios.post(`${API_BASE}/sendMessage`, {
    chat_id: config.telegram.chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function sendTelegramPhoto(photoUrl, caption) {
  await axios.post(`${API_BASE}/sendPhoto`, {
    chat_id: config.telegram.chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  });
}

function formatListingMessage(listing) {
  const parts = ['<b>🏠 דירה חדשה!</b>'];

  if (listing.price) parts.push(`<b>מחיר:</b> ${listing.price.toLocaleString()} ₪`);
  if (listing.rooms) parts.push(`<b>חדרים:</b> ${listing.rooms}`);
  if (listing.area) parts.push(`<b>אזור:</b> ${listing.area}`);
  if (listing.neighborhood) parts.push(`<b>שכונה:</b> ${listing.neighborhood}`);
  if (listing.street) parts.push(`<b>רחוב:</b> ${listing.street}`);
  if (listing.pets_allowed) parts.push('🐾 מותר בעלי חיים');
  if (listing.parking) parts.push('🚗 חניה');
  if (listing.balcony) parts.push('🌿 מרפסת');
  if (listing.phone) parts.push(`<b>טלפון:</b> ${listing.phone}`);
  if (listing.url) parts.push(`\n<a href="${listing.url}">צפה במודעה</a>`);

  return parts.join('\n');
}

/**
 * Send notification to a specific user's Telegram chat.
 */
export async function notifyUserOfListing(chatId, listing) {
  if (!config.telegram.botToken || !chatId) return;

  const caption = formatListingMessage(listing);
  const images = listing.images || [];

  try {
    if (images.length > 0) {
      await axios.post(`${API_BASE}/sendPhoto`, {
        chat_id: chatId,
        photo: images[0],
        caption,
        parse_mode: 'HTML',
      });
    } else {
      await axios.post(`${API_BASE}/sendMessage`, {
        chat_id: chatId,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    }
  } catch (err) {
    // Fallback to text if photo fails
    if (images.length > 0) {
      await axios.post(`${API_BASE}/sendMessage`, {
        chat_id: chatId,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }).catch(() => {});
    }
    throw err;
  }
}

export async function notifyNewListings() {
  if (!config.telegram.botToken || !config.telegram.chatId) return 0;

  const listings = getUnnotifiedListings();
  if (listings.length === 0) return 0;

  console.log(`[Telegram] Sending ${listings.length} new listing notifications...`);

  // Send summary header
  await sendTelegramMessage(`<b>📢 נמצאו ${listings.length} דירות חדשות!</b>`);

  // Send individual listings — with photo if available, otherwise text
  for (const listing of listings) {
    try {
      const caption = formatListingMessage(listing);
      const images = listing.images || [];
      if (images.length > 0) {
        await sendTelegramPhoto(images[0], caption);
      } else {
        await sendTelegramMessage(caption);
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      // If photo fails (e.g. expired URL), fall back to text
      console.error(`[Telegram] Failed to send listing ${listing.id}:`, err.message);
      try {
        await sendTelegramMessage(formatListingMessage(listing));
      } catch {}
    }
  }

  // Mark all as notified
  const ids = listings.map((l) => l.id);
  markListingsNotified(ids);

  console.log(`[Telegram] Notified ${listings.length} listings`);
  return listings.length;
}
