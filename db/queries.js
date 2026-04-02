import db from './pool.js';

const insertStmt = db.prepare(`
  INSERT INTO listings (
    fingerprint, source, external_id, url, price, rooms, area_sqm, floor,
    city, neighborhood, street, area, lat, lng, pets_allowed, parking, balcony,
    elevator, furnished,
    phone, description, images, posted_at, scraped_at, last_seen_at, text_hash
  ) VALUES (
    @fingerprint, @source, @externalId, @url, @price, @rooms, @areaSqm, @floor,
    @city, @neighborhood, @street, @area, @lat, @lng, @petsAllowed, @parking, @balcony,
    @elevator, @furnished,
    @phone, @description, @images, @postedAt, @scrapedAt, @lastSeenAt, @textHash
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    price = excluded.price,
    description = CASE WHEN excluded.description IS NOT NULL AND excluded.description != '' THEN excluded.description ELSE listings.description END,
    images = CASE WHEN excluded.images IS NOT NULL AND excluded.images != '[]' THEN excluded.images ELSE listings.images END,
    neighborhood = COALESCE(excluded.neighborhood, listings.neighborhood),
    area = COALESCE(excluded.area, listings.area),
    street = COALESCE(excluded.street, listings.street),
    pets_allowed = COALESCE(excluded.pets_allowed, listings.pets_allowed),
    parking = COALESCE(excluded.parking, listings.parking),
    balcony = COALESCE(excluded.balcony, listings.balcony),
    elevator = COALESCE(excluded.elevator, listings.elevator),
    furnished = COALESCE(excluded.furnished, listings.furnished),
    posted_at = COALESCE(excluded.posted_at, listings.posted_at),
    is_active = 1,
    last_seen_at = excluded.last_seen_at,
    text_hash = COALESCE(excluded.text_hash, listings.text_hash)
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
    elevator: listing.elevator == null ? null : (listing.elevator ? 1 : 0),
    furnished: listing.furnished == null ? null : (listing.furnished ? 1 : 0),
    phone: listing.phone || null,
    description: listing.description || null,
    images: JSON.stringify(listing.images || []),
    postedAt: listing.postedAt || null,
    scrapedAt: listing.scrapedAt ? new Date(listing.scrapedAt).toISOString() : new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    textHash: listing.textHash || null,
  });
  return { id: result.lastInsertRowid };
}

export function getListings({ city, area, minPrice, maxPrice, minRooms, maxRooms, rooms, pets, parking, balcony, elevator, furnished, minFloor, maxFloor, minSizeSqm, maxSizeSqm, postedWithin, page = 1, limit = 20 } = {}) {
  const conditions = ['is_active = 1'];
  const params = {};

  if (area) {
    // Match on area (broad) OR neighborhood (specific) — partial match for flexibility
    conditions.push('(area = @area OR neighborhood = @area OR area LIKE @areaLike OR neighborhood LIKE @areaLike)');
    params.area = area;
    params.areaLike = `%${area}%`;
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
  // Support both single 'rooms' and range 'minRooms/maxRooms'
  if (minRooms) {
    conditions.push('rooms >= @minRooms');
    params.minRooms = Number(minRooms);
  }
  if (maxRooms) {
    conditions.push('rooms <= @maxRooms');
    params.maxRooms = Number(maxRooms);
  }
  if (rooms && !minRooms && !maxRooms) {
    conditions.push('rooms = @rooms');
    params.rooms = Number(rooms);
  }
  if (pets === 'true' || pets === true) {
    conditions.push('pets_allowed = 1');
  }
  if (parking === 'true' || parking === true) {
    conditions.push('parking = 1');
  }
  if (balcony === 'true' || balcony === true) {
    conditions.push('balcony = 1');
  }
  if (elevator === 'true' || elevator === true) {
    conditions.push('elevator = 1');
  }
  if (furnished === 'true' || furnished === true) {
    conditions.push('furnished = 1');
  }
  if (minFloor) {
    conditions.push('floor >= @minFloor');
    params.minFloor = Number(minFloor);
  }
  if (maxFloor) {
    conditions.push('floor <= @maxFloor');
    params.maxFloor = Number(maxFloor);
  }
  if (minSizeSqm) {
    conditions.push('area_sqm >= @minSizeSqm');
    params.minSizeSqm = Number(minSizeSqm);
  }
  if (maxSizeSqm) {
    conditions.push('area_sqm <= @maxSizeSqm');
    params.maxSizeSqm = Number(maxSizeSqm);
  }
  if (postedWithin) {
    // Use posted_at if available, fall back to scraped_at so all listings are filterable
    conditions.push("COALESCE(posted_at, scraped_at) >= datetime('now', '-' || @postedWithin || ' hours')");
    params.postedWithin = Number(postedWithin);
  }

  const where = conditions.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM listings WHERE ${where}`).get(params);
  const total = countRow.count;

  const listings = db.prepare(
    `SELECT * FROM listings WHERE ${where} ORDER BY COALESCE(posted_at, scraped_at) DESC LIMIT @limit OFFSET @offset`
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

// Check if a listing already exists with complete data (images + description)
const listingExistsStmt = db.prepare(
  `SELECT id, images, description FROM listings WHERE fingerprint = ? AND is_active = 1`
);
export function listingExistsWithData(fingerprint) {
  const row = listingExistsStmt.get(fingerprint);
  if (!row) return null;
  const images = row.images ? JSON.parse(row.images) : [];
  return {
    exists: true,
    hasImages: images.length >= 2,
    hasDescription: row.description && row.description.length > 100,
  };
}

// Get listings without coordinates for background geocoding
export function getListingsWithoutCoords(limit = 20) {
  return db.prepare(
    `SELECT id, city, street, neighborhood FROM listings
     WHERE is_active = 1 AND lat IS NULL AND (street IS NOT NULL OR neighborhood IS NOT NULL)
     LIMIT ?`
  ).all(limit);
}

export function updateListingCoords(id, lat, lng) {
  db.prepare('UPDATE listings SET lat = @lat, lng = @lng WHERE id = @id').run({ id, lat, lng });
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

// --- Seen posts (skip already-processed FB posts) ---

const isPostSeenStmt = db.prepare('SELECT 1 FROM seen_posts WHERE text_hash = ?');
const markPostSeenStmt = db.prepare('INSERT OR IGNORE INTO seen_posts (text_hash) VALUES (?)');

export function isPostSeen(textHash) {
  return !!isPostSeenStmt.get(textHash);
}

export function markPostSeen(textHash) {
  markPostSeenStmt.run(textHash);
}

// --- Freshness: touch & deactivate stale listings ---

const touchByHashStmt = db.prepare(
  `UPDATE listings SET last_seen_at = @now, is_active = 1, posted_at = COALESCE(@postedAt, posted_at) WHERE text_hash = @textHash`
);

export function touchListingsByHash(aliveEntries) {
  const now = new Date().toISOString();
  const touchMany = db.transaction((entries) => {
    let touched = 0;
    for (const entry of entries) {
      const result = touchByHashStmt.run({
        textHash: entry.textHash,
        postedAt: entry.postedAt || null,
        now,
      });
      touched += result.changes;
    }
    return touched;
  });
  return touchMany(aliveEntries);
}

export function deactivateStaleListings(maxAgeHours = 48) {
  const result = db.prepare(
    `UPDATE listings SET is_active = 0
     WHERE is_active = 1
       AND last_seen_at < datetime('now', '-' || @hours || ' hours')`
  ).run({ hours: maxAgeHours });
  return result.changes;
}

// --- Notifications ---

export function getUnnotifiedListings() {
  return db.prepare(
    'SELECT * FROM listings WHERE is_active = 1 AND notified_at IS NULL ORDER BY scraped_at DESC'
  ).all().map(mapRow);
}

export function markListingsNotified(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(
    `UPDATE listings SET notified_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(...ids);
}

function mapRow(row) {
  return {
    ...row,
    pets_allowed: row.pets_allowed === 1 ? true : row.pets_allowed === 0 ? false : null,
    parking: row.parking === 1 ? true : row.parking === 0 ? false : null,
    balcony: row.balcony === 1 ? true : row.balcony === 0 ? false : null,
    elevator: row.elevator === 1 ? true : row.elevator === 0 ? false : null,
    furnished: row.furnished === 1 ? true : row.furnished === 0 ? false : null,
    images: row.images ? JSON.parse(row.images) : [],
  };
}

// --- Users ---

const createUserStmt = db.prepare(
  'INSERT INTO users (username, password_hash, email) VALUES (@username, @passwordHash, @email)'
);

export function createUser({ username, passwordHash, email }) {
  const result = createUserStmt.run({ username, passwordHash, email });
  return { id: result.lastInsertRowid, username, email };
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserTelegram(userId, chatId) {
  db.prepare('UPDATE users SET telegram_chat_id = @chatId WHERE id = @userId').run({ userId, chatId });
}

// --- User Preferences ---

export function upsertPreference(userId, pref) {
  const stmt = db.prepare(`
    INSERT INTO user_preferences (
      user_id, source, city, area, min_price, max_price, min_rooms, max_rooms,
      pets_allowed, parking, balcony, elevator, furnished,
      min_floor, max_floor, min_size_sqm, max_size_sqm, is_active, updated_at
    ) VALUES (
      @userId, @source, @city, @area, @minPrice, @maxPrice, @minRooms, @maxRooms,
      @pets, @parking, @balcony, @elevator, @furnished,
      @minFloor, @maxFloor, @minSizeSqm, @maxSizeSqm, 1, datetime('now')
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
  `);
  stmt.run({
    userId,
    source: pref.source || 'all',
    city: pref.city || null,
    area: pref.area || null,
    minPrice: pref.minPrice || null,
    maxPrice: pref.maxPrice || null,
    minRooms: pref.minRooms || null,
    maxRooms: pref.maxRooms || null,
    pets: pref.pets ? 1 : null,
    parking: pref.parking ? 1 : null,
    balcony: pref.balcony ? 1 : null,
    elevator: pref.elevator ? 1 : null,
    furnished: pref.furnished ? 1 : null,
    minFloor: pref.minFloor || null,
    maxFloor: pref.maxFloor || null,
    minSizeSqm: pref.minSizeSqm || null,
    maxSizeSqm: pref.maxSizeSqm || null,
  });
}

export function getUserPreferences(userId) {
  return db.prepare('SELECT * FROM user_preferences WHERE user_id = ? AND is_active = 1').all(userId);
}

export function getAllActivePreferences() {
  return db.prepare(`
    SELECT up.*, u.telegram_chat_id
    FROM user_preferences up
    JOIN users u ON u.id = up.user_id
    WHERE up.is_active = 1
  `).all();
}

export function deletePreference(userId, source) {
  db.prepare('DELETE FROM user_preferences WHERE user_id = @userId AND source = @source').run({ userId, source });
}

// --- Notification Log ---

export function isNotificationSent(userId, listingId, channel) {
  return !!db.prepare(
    'SELECT 1 FROM notification_log WHERE user_id = @userId AND listing_id = @listingId AND channel = @channel'
  ).get({ userId, listingId, channel });
}

export function logNotification(userId, listingId, channel) {
  db.prepare(
    'INSERT OR IGNORE INTO notification_log (user_id, listing_id, channel) VALUES (@userId, @listingId, @channel)'
  ).run({ userId, listingId, channel });
}

// Get user's notification history (matched listings)
export function getUserNotifications(userId, limit = 50) {
  const rows = db.prepare(`
    SELECT l.*, nl.sent_at as notified_at
    FROM notification_log nl
    JOIN listings l ON l.id = nl.listing_id
    WHERE nl.user_id = @userId
    ORDER BY nl.sent_at DESC
    LIMIT @limit
  `).all({ userId, limit });
  return rows.map(mapRow);
}
