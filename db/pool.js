import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Single libSQL client used everywhere.
 *
 * In production (GHA + Render):
 *   - TURSO_DATABASE_URL = libsql://...  (remote Turso)
 *   - TURSO_AUTH_TOKEN   = eyJ...
 *
 * In local dev (if env not set):
 *   - Falls back to a local SQLite file via libSQL (file: URL).
 *     No Turso credentials needed for quick local testing.
 */
const url = process.env.TURSO_DATABASE_URL || 'file:./data/gethome.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url, authToken });

// Diagnostic banner so we always know which DB the process is talking to.
if (process.env.NODE_ENV !== 'test') {
  const isRemote = url.startsWith('libsql:');
  const safeUrl = String(url).replace(/authToken=[^&]+/, 'authToken=***');
  console.log(`[DB] Connected to ${isRemote ? 'Turso (remote)' : 'local SQLite file'}: ${safeUrl}`);
}

export default client;
