import db from './pool.js';
import { config } from '../config.js';

// =======================================================================
// libSQL helpers
//   - All queries are async (HTTP/Hrana under the hood)
//   - We never use .prepare() because libsql's prepared statements
//     are bound to a single request — caching gives no benefit here
// =======================================================================

function firstRow(result) {
  return result.rows[0] || null;
}

function asListing(row) {
  if (!row) return null;
  return {
    ...row,
    pets_allowed: row.pets_allowed === 1 ? true : row.pets_allowed === 0 ? false : null,
    parking:      row.parking      === 1 ? true : row.parking      === 0 ? false : null,
    balcony:      row.balcony      === 1 ? true : row.balcony      === 0 ? false : null,
    elevator:     row.elevator     === 1 ? true : row.elevator     === 0 ? false : null,
    furnished:    row.furnished    === 1 ? true : row.furnished    === 0 ? false : null,
    images:       row.images ? JSON.parse(row.images) : [],
  };
}

const tri = (v) => v == null ? null : (v ? 1 : 0);

// =======================================================================
// Listings — insert / upsert
// =======================================================================

const INSERT_LISTING_SQL = `
  INSERT INTO listings (
    fingerprint, source, external_id, url, price, rooms, area_sqm, floor,
    city, neighborhood, street, area, lat, lng, pets_allowed, parking, balcony,
    elevator, furnished,
    phone, description, images, posted_at, scraped_at, last_seen_at, text_hash
  ) VALUES (
    :fingerprint, :source, :externalId, :url, :price, :rooms, :areaSqm, :floor,
    :city, :neighborhood, :street, :area, :lat, :lng, :petsAllowed, :parking, :balcony,
    :elevator, :furnished,
    :phone, :description, :images, :postedAt, :scrapedAt, :lastSeenAt, :textHash
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    price        = excluded.price,
    description  = CASE WHEN excluded.description IS NOT NULL AND excluded.description != '' THEN excluded.description ELSE listings.description END,
    images       = CASE WHEN excluded.images IS NOT NULL AND excluded.images != '[]' THEN excluded.images ELSE listings.images END,
    neighborhood = COALESCE(excluded.neighborhood, listings.neighborhood),
    area         = COALESCE(excluded.area,         listings.area),
    street       = COALESCE(excluded.street,       listings.street),
    pets_allowed = COALESCE(excluded.pets_allowed, listings.pets_allowed),
    parking      = COALESCE(excluded.parking,      listings.parking),
    balcony      = COALESCE(excluded.balcony,      listings.balcony),
    elevator     = COALESCE(excluded.elevator,     listings.elevator),
    furnished    = COALESCE(excluded.furnished,    listings.furnished),
    posted_at    = COALESCE(excluded.posted_at,    listings.posted_at),
    is_active    = 1,
    last_seen_at = excluded.last_seen_at,
    text_hash    = COALESCE(excluded.text_hash, listings.text_hash)
`;

export async function insertListing(listing) {
  const result = await db.execute({
    sql: INSERT_LISTING_SQL,
    args: {
      fingerprint:  listing.fingerprint,
      source:       listing.source,
      externalId:   listing.externalId || null,
      url:          listing.url || null,
      price:        listing.price || null,
      rooms:        listing.rooms || null,
      areaSqm:      listing.areaSqm || null,
      floor:        listing.floor || null,
      city:         listing.city || null,
      neighborhood: listing.neighborhood || null,
      street:       listing.street || null,
      area:         listing.area || null,
      lat:          listing.lat || null,
      lng:          listing.lng || null,
      petsAllowed:  tri(listing.petsAllowed),
      parking:      tri(listing.parking),
      balcony:      tri(listing.balcony),
      elevator:     tri(listing.elevator),
      furnished:    tri(listing.furnished),
      phone:        listing.phone || null,
      description:  listing.description || null,
      images:       JSON.stringify(listing.images || []),
      postedAt:     listing.postedAt || null,
      scrapedAt:    listing.scrapedAt ? new Date(listing.scrapedAt).toISOString() : new Date().toISOString(),
      lastSeenAt:   new Date().toISOString(),
      textHash:     listing.textHash || null,
    },
  });
  // libSQL returns lastInsertRowid as BigInt; cast for JSON-safety
  return { id: Number(result.lastInsertRowid) };
}

// =======================================================================
// Listings — read
// =======================================================================

export async function getListings({
  city, area, minPrice, maxPrice, minRooms, maxRooms, rooms,
  pets, parking, balcony, elevator, furnished,
  minFloor, maxFloor, minSizeSqm, maxSizeSqm, postedWithin,
  page = 1, limit = 20,
} = {}) {
  const conditions = ['is_active = 1'];
  const args = {};

  if (area) {
    conditions.push('(area = :area OR neighborhood = :area OR area LIKE :areaLike OR neighborhood LIKE :areaLike)');
    args.area = area;
    args.areaLike = `%${area}%`;
  } else if (city) {
    conditions.push('city = :city');
    args.city = city;
  }
  if (minPrice)            { conditions.push('price >= :minPrice');         args.minPrice = Number(minPrice); }
  if (maxPrice)            { conditions.push('price <= :maxPrice');         args.maxPrice = Number(maxPrice); }
  if (minRooms)            { conditions.push('rooms >= :minRooms');         args.minRooms = Number(minRooms); }
  if (maxRooms)            { conditions.push('rooms <= :maxRooms');         args.maxRooms = Number(maxRooms); }
  if (rooms && !minRooms && !maxRooms) {
    conditions.push('rooms = :rooms');
    args.rooms = Number(rooms);
  }
  if (pets     === 'true' || pets     === true) conditions.push('pets_allowed = 1');
  if (parking  === 'true' || parking  === true) conditions.push('parking      = 1');
  if (balcony  === 'true' || balcony  === true) conditions.push('balcony      = 1');
  if (elevator === 'true' || elevator === true) conditions.push('elevator     = 1');
  if (furnished=== 'true' || furnished=== true) conditions.push('furnished    = 1');
  if (minFloor)   { conditions.push('floor    >= :minFloor');   args.minFloor   = Number(minFloor); }
  if (maxFloor)   { conditions.push('floor    <= :maxFloor');   args.maxFloor   = Number(maxFloor); }
  if (minSizeSqm) { conditions.push('area_sqm >= :minSizeSqm'); args.minSizeSqm = Number(minSizeSqm); }
  if (maxSizeSqm) { conditions.push('area_sqm <= :maxSizeSqm'); args.maxSizeSqm = Number(maxSizeSqm); }
  if (postedWithin) {
    conditions.push("COALESCE(posted_at, scraped_at) >= datetime('now', '-' || :postedWithin || ' hours')");
    args.postedWithin = Number(postedWithin);
  }

  const where = conditions.join(' AND ');
  const lim = Number(limit);
  const offset = (Number(page) - 1) * lim;

  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM listings WHERE ${where}`,
    args,
  });
  const total = Number(countRes.rows[0].count);

  const listRes = await db.execute({
    sql: `SELECT * FROM listings WHERE ${where} ORDER BY COALESCE(posted_at, scraped_at) DESC LIMIT :limit OFFSET :offset`,
    args: { ...args, limit: lim, offset },
  });

  return {
    listings: listRes.rows.map(asListing),
    total,
    page: Number(page),
    totalPages: Math.ceil(total / lim),
  };
}

export async function getListingById(id) {
  const res = await db.execute({ sql: 'SELECT * FROM listings WHERE id = ?', args: [id] });
  return asListing(firstRow(res));
}

export async function listingExistsWithData(fingerprint) {
  const res = await db.execute({
    sql: 'SELECT id, images, description FROM listings WHERE fingerprint = ? AND is_active = 1',
    args: [fingerprint],
  });
  const row = firstRow(res);
  if (!row) return null;
  const images = row.images ? JSON.parse(row.images) : [];
  return {
    exists: true,
    hasImages: images.length >= 2,
    hasDescription: row.description && row.description.length > 100,
  };
}

export async function getListingsWithoutCoords(limit = 20) {
  const res = await db.execute({
    sql: `SELECT id, city, street, neighborhood FROM listings
          WHERE is_active = 1 AND lat IS NULL AND (street IS NOT NULL OR neighborhood IS NOT NULL)
          LIMIT ?`,
    args: [limit],
  });
  return res.rows;
}

export async function updateListingCoords(id, lat, lng) {
  await db.execute({
    sql: 'UPDATE listings SET lat = :lat, lng = :lng WHERE id = :id',
    args: { id, lat, lng },
  });
}

export async function getMapListings({ bbox, limit } = {}) {
  const conditions = ['is_active = 1', 'lat IS NOT NULL', 'lng IS NOT NULL'];
  const args = {};
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    conditions.push('lng >= :minLng AND lng <= :maxLng AND lat >= :minLat AND lat <= :maxLat');
    Object.assign(args, { minLng, minLat, maxLng, maxLat });
  }
  const cap = Number(limit) > 0 ? Number(limit) : (config.serving?.mapMaxMarkers || 2000);
  const res = await db.execute({
    sql: `SELECT id, lat, lng, price, rooms, city, area, neighborhood FROM listings
          WHERE ${conditions.join(' AND ')}
          ORDER BY COALESCE(posted_at, scraped_at) DESC
          LIMIT :limit`,
    args: { ...args, limit: cap },
  });
  return res.rows;
}

// =======================================================================
// Sessions (FB cookies + storage state)
// =======================================================================

export async function saveSession(key, value) {
  await db.execute({
    sql: `INSERT INTO sessions (key, value, updated_at) VALUES (:key, :value, datetime('now'))
          ON CONFLICT (key) DO UPDATE SET value = :value, updated_at = datetime('now')`,
    args: { key, value: JSON.stringify(value) },
  });
}

export async function loadSession(key) {
  const res = await db.execute({ sql: 'SELECT value FROM sessions WHERE key = ?', args: [key] });
  const row = firstRow(res);
  return row ? JSON.parse(row.value) : null;
}

// =======================================================================
// Seen posts (FB dedup)
// =======================================================================

export async function isPostSeen(textHash) {
  const res = await db.execute({ sql: 'SELECT 1 FROM seen_posts WHERE text_hash = ?', args: [textHash] });
  return res.rows.length > 0;
}

export async function markPostSeen(textHash) {
  await db.execute({ sql: 'INSERT OR IGNORE INTO seen_posts (text_hash) VALUES (?)', args: [textHash] });
}

export async function pruneSeenPosts(maxAgeDays = 30) {
  const res = await db.execute({
    sql: `DELETE FROM seen_posts WHERE seen_at < datetime('now', '-' || :days || ' days')`,
    args: { days: maxAgeDays },
  });
  return res.rowsAffected;
}

// =======================================================================
// Freshness — touch / deactivate
// =======================================================================

export async function touchListingsByHash(aliveEntries) {
  if (!aliveEntries || aliveEntries.length === 0) return 0;
  const now = new Date().toISOString();
  // libSQL supports batched writes in a single round-trip
  const stmts = aliveEntries.map(e => ({
    sql: `UPDATE listings SET last_seen_at = :now, is_active = 1, posted_at = COALESCE(:postedAt, posted_at) WHERE text_hash = :textHash`,
    args: { textHash: e.textHash, postedAt: e.postedAt || null, now },
  }));
  const results = await db.batch(stmts, 'write');
  return results.reduce((sum, r) => sum + (r.rowsAffected || 0), 0);
}

/**
 * HARD DELETE listings not re-seen within the window. last_seen_at is bumped
 * on every reappearance (insertListing upsert + touchListingsByHash), so
 * anything past the window is genuinely gone from the source. We delete
 * outright instead of soft-deactivating so the table only holds live stock.
 */
export async function deleteStaleListings(maxAgeHours = 168) {
  const res = await db.execute({
    sql: `DELETE FROM listings
          WHERE last_seen_at < datetime('now', '-' || :hours || ' hours')`,
    args: { hours: maxAgeHours },
  });
  return res.rowsAffected;
}

// Back-compat alias — old name kept so callers don't break in one PR.
export const deactivateStaleListings = deleteStaleListings;

// =======================================================================
// Notifications
// =======================================================================

export async function getUnnotifiedListings() {
  const res = await db.execute(
    'SELECT * FROM listings WHERE is_active = 1 AND notified_at IS NULL ORDER BY scraped_at DESC'
  );
  return res.rows.map(asListing);
}

export async function markListingsNotified(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.execute({
    sql: `UPDATE listings SET notified_at = datetime('now') WHERE id IN (${placeholders})`,
    args: ids,
  });
}

// =======================================================================
// Users
// =======================================================================

export async function createUser({ username, passwordHash, email }) {
  const res = await db.execute({
    sql: 'INSERT INTO users (username, password_hash, email) VALUES (:username, :passwordHash, :email)',
    args: { username, passwordHash, email: email || null },
  });
  return { id: Number(res.lastInsertRowid), username, email };
}

export async function getUserByUsername(username) {
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
  return firstRow(res);
}

export async function getUserById(id) {
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return firstRow(res);
}

export async function updateUserTelegram(userId, chatId) {
  await db.execute({
    sql: 'UPDATE users SET telegram_chat_id = :chatId WHERE id = :userId',
    args: { userId, chatId },
  });
}

// =======================================================================
// User preferences
// =======================================================================

export async function upsertPreference(userId, pref) {
  await db.execute({
    sql: `
      INSERT INTO user_preferences (
        user_id, source, city, area, min_price, max_price, min_rooms, max_rooms,
        pets_allowed, parking, balcony, elevator, furnished,
        min_floor, max_floor, min_size_sqm, max_size_sqm, is_active, updated_at
      ) VALUES (
        :userId, :source, :city, :area, :minPrice, :maxPrice, :minRooms, :maxRooms,
        :pets, :parking, :balcony, :elevator, :furnished,
        :minFloor, :maxFloor, :minSizeSqm, :maxSizeSqm, 1, datetime('now')
      )
      ON CONFLICT (user_id, source) DO UPDATE SET
        city = excluded.city, area = excluded.area,
        min_price = excluded.min_price, max_price = excluded.max_price,
        min_rooms = excluded.min_rooms, max_rooms = excluded.max_rooms,
        pets_allowed = excluded.pets_allowed, parking = excluded.parking,
        balcony = excluded.balcony, elevator = excluded.elevator, furnished = excluded.furnished,
        min_floor = excluded.min_floor, max_floor = excluded.max_floor,
        min_size_sqm = excluded.min_size_sqm, max_size_sqm = excluded.max_size_sqm,
        is_active = 1, updated_at = datetime('now')
    `,
    args: {
      userId,
      source:      pref.source || 'all',
      city:        pref.city || null,
      area:        pref.area || null,
      minPrice:    pref.minPrice || null,
      maxPrice:    pref.maxPrice || null,
      minRooms:    pref.minRooms || null,
      maxRooms:    pref.maxRooms || null,
      pets:        pref.pets ? 1 : null,
      parking:     pref.parking ? 1 : null,
      balcony:     pref.balcony ? 1 : null,
      elevator:    pref.elevator ? 1 : null,
      furnished:   pref.furnished ? 1 : null,
      minFloor:    pref.minFloor || null,
      maxFloor:    pref.maxFloor || null,
      minSizeSqm:  pref.minSizeSqm || null,
      maxSizeSqm:  pref.maxSizeSqm || null,
    },
  });
}

export async function getUserPreferences(userId) {
  const res = await db.execute({
    sql: 'SELECT * FROM user_preferences WHERE user_id = ? AND is_active = 1',
    args: [userId],
  });
  return res.rows;
}

export async function getAllActivePreferences() {
  const res = await db.execute(`
    SELECT up.*, u.telegram_chat_id
    FROM user_preferences up
    JOIN users u ON u.id = up.user_id
    WHERE up.is_active = 1
  `);
  return res.rows;
}

export async function deletePreference(userId, source) {
  await db.execute({
    sql: 'DELETE FROM user_preferences WHERE user_id = :userId AND source = :source',
    args: { userId, source },
  });
}

// =======================================================================
// Notification log
// =======================================================================

export async function isNotificationSent(userId, listingId, channel) {
  const res = await db.execute({
    sql: 'SELECT 1 FROM notification_log WHERE user_id = :userId AND listing_id = :listingId AND channel = :channel',
    args: { userId, listingId, channel },
  });
  return res.rows.length > 0;
}

export async function logNotification(userId, listingId, channel) {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO notification_log (user_id, listing_id, channel) VALUES (:userId, :listingId, :channel)',
    args: { userId, listingId, channel },
  });
}

export async function getUserNotifications(userId, limit = 50) {
  const res = await db.execute({
    sql: `
      SELECT l.*, nl.sent_at as notified_at
      FROM notification_log nl
      JOIN listings l ON l.id = nl.listing_id
      WHERE nl.user_id = :userId
      ORDER BY nl.sent_at DESC
      LIMIT :limit
    `,
    args: { userId, limit },
  });
  return res.rows.map(asListing);
}
