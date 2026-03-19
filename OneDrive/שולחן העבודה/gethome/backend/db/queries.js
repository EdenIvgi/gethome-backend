import db from './pool.js';

const insertStmt = db.prepare(`
  INSERT INTO listings (
    fingerprint, source, external_id, url, price, rooms, area_sqm, floor,
    city, neighborhood, street, area, lat, lng, pets_allowed, parking, balcony,
    phone, description, images, scraped_at
  ) VALUES (
    @fingerprint, @source, @externalId, @url, @price, @rooms, @areaSqm, @floor,
    @city, @neighborhood, @street, @area, @lat, @lng, @petsAllowed, @parking, @balcony,
    @phone, @description, @images, @scrapedAt
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    price = excluded.price,
    is_active = 1,
    scraped_at = excluded.scraped_at
`);

export function insertListing(listing) {
  const result = insertStmt.run({
    fingerprint: listing.fingerprint,
    source: listing.source,
    externalId: listing.externalId || null,
    url: listing.url || null,
    price: listing.price || null,
    rooms: listing.rooms || null,
    areaSqm: listing.areaSqm || null,
    floor: listing.floor || null,
    city: listing.city || null,
    neighborhood: listing.neighborhood || null,
    street: listing.street || null,
    area: listing.area || null,
    lat: listing.lat || null,
    lng: listing.lng || null,
    petsAllowed: listing.petsAllowed == null ? null : (listing.petsAllowed ? 1 : 0),
    parking: listing.parking == null ? null : (listing.parking ? 1 : 0),
    balcony: listing.balcony == null ? null : (listing.balcony ? 1 : 0),
    phone: listing.phone || null,
    description: listing.description || null,
    images: JSON.stringify(listing.images || []),
    scrapedAt: listing.scrapedAt ? new Date(listing.scrapedAt).toISOString() : new Date().toISOString(),
  });
  return { id: result.lastInsertRowid };
}

export function getListings({ city, area, minPrice, maxPrice, rooms, pets, page = 1, limit = 20 } = {}) {
  const conditions = ['is_active = 1'];
  const params = {};

  if (area) {
    conditions.push('area = @area');
    params.area = area;
  } else if (city) {
    conditions.push('city = @city');
    params.city = city;
  }
  if (minPrice) {
    conditions.push('price >= @minPrice');
    params.minPrice = Number(minPrice);
  }
  if (maxPrice) {
    conditions.push('price <= @maxPrice');
    params.maxPrice = Number(maxPrice);
  }
  if (rooms) {
    conditions.push('rooms = @rooms');
    params.rooms = Number(rooms);
  }
  if (pets === 'true' || pets === true) {
    conditions.push('pets_allowed = 1');
  }

  const where = conditions.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM listings WHERE ${where}`).get(params);
  const total = countRow.count;

  const listings = db.prepare(
    `SELECT * FROM listings WHERE ${where} ORDER BY scraped_at DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: Number(limit), offset });

  // Convert booleans and images for JSON response
  const mapped = listings.map(mapRow);

  return {
    listings: mapped,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  };
}

export function getListingById(id) {
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  return row ? mapRow(row) : null;
}

export function getMapListings() {
  const rows = db.prepare(
    'SELECT id, lat, lng, price, rooms, city, area, neighborhood FROM listings WHERE is_active = 1 AND lat IS NOT NULL AND lng IS NOT NULL'
  ).all();
  return rows;
}

export function saveSession(key, value) {
  db.prepare(
    `INSERT INTO sessions (key, value, updated_at) VALUES (@key, @value, datetime('now'))
     ON CONFLICT (key) DO UPDATE SET value = @value, updated_at = datetime('now')`
  ).run({ key, value: JSON.stringify(value) });
}

export function loadSession(key) {
  const row = db.prepare('SELECT value FROM sessions WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function mapRow(row) {
  return {
    ...row,
    pets_allowed: row.pets_allowed === 1 ? true : row.pets_allowed === 0 ? false : null,
    parking: row.parking === 1 ? true : row.parking === 0 ? false : null,
    balcony: row.balcony === 1 ? true : row.balcony === 0 ? false : null,
    images: row.images ? JSON.parse(row.images) : [],
  };
}
