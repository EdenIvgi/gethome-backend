import { normalize } from './normalizer.js';
import { createFingerprint } from './deduplicator.js';
import { geocode } from './geocoder.js';
import { insertListing } from '../db/queries.js';

export async function runPipeline(rawListings) {
  const stats = { added: 0, skipped: 0, errors: 0 };

  for (const raw of rawListings) {
    try {
      const normalized = normalize(raw);
      normalized.fingerprint = createFingerprint(normalized);

      if (!normalized.lat || !normalized.lng) {
        const coords = await geocode(normalized.city, normalized.street);
        normalized.lat = coords.lat;
        normalized.lng = coords.lng;
      }

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
  return stats;
}
