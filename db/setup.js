import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

try {
  db.exec(sql);

  // Migration: add area column if missing
  const columns = db.prepare("PRAGMA table_info(listings)").all();
  if (!columns.find(c => c.name === 'area')) {
    db.exec('ALTER TABLE listings ADD COLUMN area TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_listings_area ON listings(area)');
    console.log('Migration: added area column to listings.');
  }

  // Migration: add notified_at column if missing
  if (!columns.find(c => c.name === 'notified_at')) {
    db.exec('ALTER TABLE listings ADD COLUMN notified_at TEXT');
    console.log('Migration: added notified_at column to listings.');
  }

  // Migration: add elevator column if missing
  if (!columns.find(c => c.name === 'elevator')) {
    db.exec('ALTER TABLE listings ADD COLUMN elevator INTEGER');
    console.log('Migration: added elevator column to listings.');
  }

  // Migration: add furnished column if missing
  if (!columns.find(c => c.name === 'furnished')) {
    db.exec('ALTER TABLE listings ADD COLUMN furnished INTEGER');
    console.log('Migration: added furnished column to listings.');
  }

  // Index for neighborhood filtering
  db.exec('CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood)');

  console.log('Database schema created successfully.');
} catch (err) {
  console.error('Failed to create schema:', err.message);
  process.exit(1);
}
