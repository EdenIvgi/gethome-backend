import { config } from '../../config.js';
import { getAllActivePreferences } from '../../db/queries.js';

/**
 * Build aggregated Yad2 URLs from all active user preferences.
 * Merges all users' filters into the widest bounding box to minimize requests.
 * Returns an array of URLs (typically just one per city).
 */
export async function buildAggregatedUrls() {
  const all = await getAllActivePreferences();
  const prefs = all.filter((p) => p.source === 'yad2' || p.source === 'all');

  if (prefs.length === 0) {
    // Default: Tel Aviv, no specific filters
    return [{ url: `https://www.yad2.co.il/realestate/rent?city=${config.yad2.cityId}`, prefs }];
  }

  // Compute widest bounding box across all preferences
  let minPrice = Infinity;
  let maxPrice = 0;
  let minRooms = Infinity;
  let maxRooms = 0;

  for (const p of prefs) {
    if (p.min_price && p.min_price < minPrice) minPrice = p.min_price;
    if (p.max_price && p.max_price > maxPrice) maxPrice = p.max_price;
    if (p.min_rooms && p.min_rooms < minRooms) minRooms = p.min_rooms;
    if (p.max_rooms && p.max_rooms > maxRooms) maxRooms = p.max_rooms;
  }

  const params = new URLSearchParams();
  params.set('city', String(config.yad2.cityId));

  if (minPrice !== Infinity) params.set('price', `${minPrice}-${maxPrice || ''}`);
  if (minRooms !== Infinity) params.set('rooms', `${minRooms}-${maxRooms || ''}`);

  const url = `https://www.yad2.co.il/realestate/rent?${params.toString()}`;
  return [{ url, prefs }];
}

/**
 * Check if a listing matches a specific user preference.
 * Rules:
 *   - If the user set a criterion and the listing has no data for it → skip (no match).
 *   - Numeric comparisons use Number() to avoid NaN/undefined bugs.
 *   - Area matching also checks neighborhood (partial match) via config.
 */
export function listingMatchesPreference(listing, pref) {
  // --- Price ---
  const price = Number(listing.price);
  if (pref.min_price) {
    if (!listing.price || price < pref.min_price) return false;
  }
  if (pref.max_price) {
    if (!listing.price || price > pref.max_price) return false;
  }

  // --- Rooms ---
  const rooms = Number(listing.rooms);
  if (pref.min_rooms) {
    if (!listing.rooms || rooms < pref.min_rooms) return false;
  }
  if (pref.max_rooms) {
    if (!listing.rooms || rooms > pref.max_rooms) return false;
  }

  // --- Area / Location ---
  if (pref.area) {
    const listingArea = listing.area || null;
    const listingNeighborhood = listing.neighborhood || null;

    // Exact area match
    let areaMatch = listingArea === pref.area;

    // Also check if neighborhood belongs to the preference area (via config mapping)
    if (!areaMatch && listingNeighborhood) {
      const areaNeighborhoods = config.telAvivAreas[pref.area] || [];
      areaMatch = areaNeighborhoods.some(
        (n) => listingNeighborhood.includes(n) || n.includes(listingNeighborhood)
      );
    }

    if (!areaMatch) return false;
  }

  // --- Amenities (only filter if user explicitly requires them) ---
  if (pref.pets_allowed && !listing.petsAllowed && !listing.pets_allowed) return false;
  if (pref.parking && !listing.parking) return false;
  if (pref.balcony && !listing.balcony) return false;
  if (pref.elevator && !listing.elevator) return false;
  if (pref.furnished && !listing.furnished) return false;

  // --- Floor ---
  const floor = Number(listing.floor);
  if (pref.min_floor) {
    if (listing.floor == null || floor < pref.min_floor) return false;
  }
  if (pref.max_floor) {
    if (listing.floor == null || floor > pref.max_floor) return false;
  }

  // --- Size ---
  const size = Number(listing.areaSqm || listing.area_sqm);
  if (pref.min_size_sqm) {
    if (!listing.areaSqm && !listing.area_sqm || size < pref.min_size_sqm) return false;
  }
  if (pref.max_size_sqm) {
    if (!listing.areaSqm && !listing.area_sqm || size > pref.max_size_sqm) return false;
  }

  return true;
}
