CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  price INTEGER,
  rooms REAL,
  area_sqm INTEGER,
  floor INTEGER,
  city TEXT,
  neighborhood TEXT,
  street TEXT,
  area TEXT,
  lat REAL,
  lng REAL,
  pets_allowed INTEGER,
  parking INTEGER,
  balcony INTEGER,
  phone TEXT,
  description TEXT,
  images TEXT,
  posted_at TEXT,
  scraped_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  text_hash TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_rooms ON listings(rooms);
CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_fingerprint ON listings(fingerprint);
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source);
CREATE INDEX IF NOT EXISTS idx_listings_active_recency ON listings(is_active, COALESCE(posted_at, scraped_at) DESC);

CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seen_posts (
  text_hash TEXT PRIMARY KEY,
  seen_at TEXT DEFAULT (datetime('now'))
);

-- Users & auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  telegram_chat_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-user notification preferences / alert filters
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'all',
  city TEXT DEFAULT 'תל אביב',
  area TEXT,
  min_price INTEGER,
  max_price INTEGER,
  min_rooms REAL,
  max_rooms REAL,
  pets_allowed INTEGER,
  parking INTEGER,
  balcony INTEGER,
  elevator INTEGER,
  furnished INTEGER,
  min_floor INTEGER,
  max_floor INTEGER,
  min_size_sqm INTEGER,
  max_size_sqm INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, source)
);

-- Track which notifications were sent to avoid duplicates
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, listing_id, channel)
);
