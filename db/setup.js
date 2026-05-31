import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db from './pool.js';

// (pathToFileURL is imported lazily at bottom for the isMain check)

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run schema + idempotent migrations.
 * Safe to call on every process start (libSQL CREATE TABLE IF NOT EXISTS / ALTER add column with try/catch).
 */
export async function setupDatabase() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

  // schema.sql contains multiple statements – split on semicolons.
  // Strip out comment-only lines from the START of each statement (some statements
  // are preceded by a `-- section header` which would otherwise look like a comment-only chunk).
  const statements = sql
    .split(';')
    .map(s => {
      return s
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
    })
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      // Ignore "table already exists" / "duplicate column" noise — schema is idempotent
      if (!/already exists|duplicate column/i.test(err.message)) {
        console.error(`Schema statement failed:\n${stmt}\n→ ${err.message}`);
        throw err;
      }
    }
  }

  // ---- Idempotent column migrations (added after the initial schema) ----
  const cols = await db.execute('PRAGMA table_info(listings)');
  const colNames = new Set(cols.rows.map(r => r.name));

  const migrations = [
    { col: 'area',         sql: 'ALTER TABLE listings ADD COLUMN area TEXT' },
    { col: 'notified_at',  sql: 'ALTER TABLE listings ADD COLUMN notified_at TEXT' },
    { col: 'elevator',     sql: 'ALTER TABLE listings ADD COLUMN elevator INTEGER' },
    { col: 'furnished',    sql: 'ALTER TABLE listings ADD COLUMN furnished INTEGER' },
    { col: 'last_seen_at', sql: 'ALTER TABLE listings ADD COLUMN last_seen_at TEXT' },
    { col: 'text_hash',    sql: 'ALTER TABLE listings ADD COLUMN text_hash TEXT' },
    { col: 'posted_at',    sql: 'ALTER TABLE listings ADD COLUMN posted_at TEXT' },
  ];

  for (const { col, sql: migration } of migrations) {
    if (!colNames.has(col)) {
      try {
        await db.execute(migration);
        console.log(`[DB] Migration: added ${col} column`);
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) throw err;
      }
    }
  }

  await db.execute('CREATE INDEX IF NOT EXISTS idx_listings_area ON listings(area)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source)');
  // Expression index matches the ORDER BY in getListings exactly so the planner can skip the sort step.
  await db.execute('CREATE INDEX IF NOT EXISTS idx_listings_active_recency ON listings(is_active, COALESCE(posted_at, scraped_at) DESC)');
  // Partial index sized to exactly the rows getUnnotifiedListings() scans.
  await db.execute('CREATE INDEX IF NOT EXISTS idx_listings_unnotified ON listings(scraped_at DESC) WHERE is_active = 1 AND notified_at IS NULL');

  console.log('[DB] Schema ready');
}

// Allow running directly: `node db/setup.js`
// Use pathToFileURL for cross-platform safety (Windows file:/// vs POSIX file://)
import { pathToFileURL } from 'url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    });
}
