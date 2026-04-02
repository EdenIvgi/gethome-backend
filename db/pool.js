import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'gethome.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Migrations: add columns if they don't exist yet (skip if table doesn't exist)
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='listings'").get();
if (tableExists) {
  try {
    db.prepare("SELECT last_seen_at FROM listings LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE listings ADD COLUMN last_seen_at TEXT");
    db.exec("UPDATE listings SET last_seen_at = scraped_at");
    console.log('[DB] Added last_seen_at column');
  }
  try {
    db.prepare("SELECT text_hash FROM listings LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE listings ADD COLUMN text_hash TEXT");
    console.log('[DB] Added text_hash column');
  }
  try {
    db.prepare("SELECT posted_at FROM listings LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE listings ADD COLUMN posted_at TEXT");
    console.log('[DB] Added posted_at column');
  }
}

export default db;
