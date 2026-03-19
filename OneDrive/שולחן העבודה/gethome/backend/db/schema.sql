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
  scraped_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_rooms ON listings(rooms);
CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_fingerprint ON listings(fingerprint);

CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
