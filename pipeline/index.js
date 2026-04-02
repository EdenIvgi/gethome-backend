import { normalize } from './normalizer.js';
import { createFingerprint } from './deduplicator.js';
import { geocode } from './geocoder.js';
import { insertListing, getListingsWithoutCoords, updateListingCoords } from '../db/queries.js';

export async function runPipeline(rawListings) {
  const stats = { added: 0, skipped: 0, errors: 0 };

  for (const raw of rawListings) {
    try {
      const normalized = normalize(raw);
      normalized.fingerprint = createFingerprint(normalized);

      // Insert immediately without geocoding — coordinates added in background
      const result = insertListing(normalized);
      if (result) {
        stats.added++;
      } else {
        stats.skipped++;
      }
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint')) {
        stats.skipped++;
      } else {
        stats.errors++;
        console.error('Pipeline error:', err.message);
      }
    }
  }

  console.log(`Pipeline: added=${stats.added}, skipped=${stats.skipped}, errors=${stats.errors}`);

  // Kick off background geocoding (non-blocking)
  geocodePending().catch((err) => console.error('Background geocoding error:', err.message));

  return stats;
}

/**
 * Background geocoding: process listings without coordinates.
 * Runs after scan completes — doesn't block the pipeline.
 */
export async function geocodePending() {
  const pending = getListingsWithoutCoords(30);
  if (pending.length === 0) return;

  console.log(`[Geocode] Processing ${pending.length} listings without coordinates...`);
  let geocoded = 0;

  for (const listing of pending) {
    try {
      const coords = await geocode(listing.city, listing.street || listing.neighborhood);
      if (coords.lat && coords.lng) {
        updateListingCoords(listing.id, coords.lat, coords.lng);
        geocoded++;
      }
    } catch (err) {
      // Skip individual failures silently
    }
  }

  console.log(`[Geocode] Done: ${geocoded}/${pending.length} geocoded`);
}
