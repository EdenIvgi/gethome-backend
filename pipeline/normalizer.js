import { config } from '../config.js';

const CITY_ALIASES = {
  'ת"א': 'תל אביב',
  'תל-אביב': 'תל אביב',
  'תל אביב יפו': 'תל אביב',
  'תל אביב-יפו': 'תל אביב',
  'י-ם': 'ירושלים',
  'ירושלים': 'ירושלים',
  'פ"ת': 'פתח תקווה',
  'פתח-תקווה': 'פתח תקווה',
  'ר"ג': 'רמת גן',
  'רמת-גן': 'רמת גן',
  'ב"ש': 'באר שבע',
  'באר-שבע': 'באר שבע',
  'ר"ל': 'ראשון לציון',
  'ראשל"צ': 'ראשון לציון',
};

// Build reverse lookup: neighborhood → area
const neighborhoodToArea = {};
for (const [area, neighborhoods] of Object.entries(config.telAvivAreas)) {
  for (const n of neighborhoods) {
    neighborhoodToArea[n] = area;
  }
}

function normalizeCity(city) {
  if (!city) return null;
  const trimmed = city.trim();
  return CITY_ALIASES[trimmed] || trimmed;
}

function normalizeArea(neighborhood) {
  if (!neighborhood) return null;
  const trimmed = neighborhood.trim();
  if (neighborhoodToArea[trimmed]) return neighborhoodToArea[trimmed];
  for (const [n, area] of Object.entries(neighborhoodToArea)) {
    if (trimmed.includes(n) || n.includes(trimmed)) return area;
  }
  return null;
}

function parsePrice(price) {
  if (typeof price === 'number') return price;
  if (!price) return null;
  const cleaned = String(price).replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function parseRooms(rooms) {
  if (typeof rooms === 'number') return rooms;
  if (!rooms) return null;
  const num = parseFloat(String(rooms));
  return isNaN(num) ? null : num;
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 'כן' || val === 1) return true;
  if (val === 'false' || val === 'לא' || val === 0) return false;
  return null;
}

export function normalize(listing) {
  const normalized = {
    ...listing,
    city: normalizeCity(listing.city),
    price: parsePrice(listing.price),
    rooms: parseRooms(listing.rooms),
    areaSqm: listing.areaSqm ? parseInt(String(listing.areaSqm), 10) || null : null,
    floor: listing.floor != null ? parseInt(String(listing.floor), 10) || null : null,
    petsAllowed: parseBool(listing.petsAllowed),
    parking: parseBool(listing.parking),
    balcony: parseBool(listing.balcony),
  };
  normalized.area = normalizeArea(normalized.neighborhood);
  return normalized;
}
