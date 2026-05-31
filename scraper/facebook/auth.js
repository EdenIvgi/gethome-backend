import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { saveSession, loadSession } from '../../db/queries.js';

chromium.use(stealth());

const SESSION_FILE = 'fb_session.json';
const SESSION_DB_KEY = 'fb_storage_state';

/**
 * Open a Playwright context that's logged into Facebook.
 *
 * Priority for the storage state:
 *   1. Turso (DB key fb_storage_state) — always tried first now.
 *   2. Local file (fb_session.json) — fallback for dev / first-run.
 *
 * In GHA the local file doesn't exist, so DB is the only path.
 */
export async function getAuthenticatedContext(options = {}) {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
  });

  let storageState = null;

  // 1. DB first
  try {
    storageState = await loadSession(SESSION_DB_KEY);
    if (storageState) console.log(`[FB Auth] Loaded session from DB`);
  } catch (err) {
    console.warn(`[FB Auth] DB session load failed: ${err.message}`);
  }

  // 2. File fallback
  if (!storageState && existsSync(SESSION_FILE)) {
    try {
      storageState = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
      console.log(`[FB Auth] Loaded session from file`);
    } catch (err) {
      console.warn(`[FB Auth] File session load failed: ${err.message}`);
    }
  }

  if (!storageState) {
    console.warn('[FB Auth] No session found — login is required. FB will block scraping.');
  }

  const context = await browser.newContext({
    storageState: storageState || undefined,
    locale: 'he-IL',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  return { browser, context };
}

export async function saveStorageState(context) {
  const state = await context.storageState();

  // File (dev convenience)
  try {
    writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
  } catch {}

  // DB (production-critical)
  try {
    await saveSession(SESSION_DB_KEY, state);
  } catch (err) {
    console.warn(`[FB Auth] DB session save failed: ${err.message}`);
  }

  return state;
}
