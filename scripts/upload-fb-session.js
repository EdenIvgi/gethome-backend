#!/usr/bin/env node
/**
 * upload-fb-session.js
 *
 * Reads the local fb_session.json (produced by `npm run login-fb`) and uploads
 * it to the Turso `sessions` table under key `fb_storage_state`.
 * Run this after a successful local login, before pushing changes.
 *
 * Usage: npm run session:upload
 */
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync, existsSync } from 'fs';
import { saveSession } from '../db/queries.js';
import { setupDatabase } from '../db/setup.js';

const SESSION_FILE = 'fb_session.json';
const SESSION_DB_KEY = 'fb_storage_state';

async function main() {
  if (!existsSync(SESSION_FILE)) {
    console.error(`✗ ${SESSION_FILE} not found. Run \`npm run login-fb\` first.`);
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
  } catch (err) {
    console.error(`✗ Failed to parse ${SESSION_FILE}: ${err.message}`);
    process.exit(1);
  }

  if (!state.cookies || state.cookies.length === 0) {
    console.error(`✗ ${SESSION_FILE} has no cookies. Did login complete?`);
    process.exit(1);
  }

  // Make sure the sessions table exists
  await setupDatabase();

  await saveSession(SESSION_DB_KEY, state);
  console.log(`✓ Uploaded ${state.cookies.length} cookies to Turso (key=${SESSION_DB_KEY})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
