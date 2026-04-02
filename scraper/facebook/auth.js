import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { saveSession, loadSession } from '../../db/queries.js';

const SESSION_FILE = 'fb_session.json';
const SESSION_DB_KEY = 'fb_storage_state';

export async function getAuthenticatedContext(options = {}) {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    channel: 'chrome',
  });

  let storageState = null;

  // Try loading session from DB first (production), then file (dev)
  if (process.env.NODE_ENV === 'production') {
    storageState = loadSession(SESSION_DB_KEY);
  } else if (existsSync(SESSION_FILE)) {
    storageState = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
  }

  const context = await browser.newContext({
    storageState: storageState || undefined,
    locale: 'he-IL',
    viewport: { width: 1280, height: 800 },
  });

  return { browser, context };
}

export async function saveStorageState(context) {
  const state = await context.storageState();

  // Save to file (dev)
  writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));

  // Save to DB (production)
  try {
    saveSession(SESSION_DB_KEY, state);
  } catch {
    // DB might not be available during initial login
  }

  return state;
}
