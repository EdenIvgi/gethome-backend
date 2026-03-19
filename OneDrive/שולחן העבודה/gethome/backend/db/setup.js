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

  console.log('Database schema created successfully.');
} catch (err) {
  console.error('Failed to create schema:', err.message);
  process.exit(1);
}
