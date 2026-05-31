import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import { saveStorageState } from './auth.js';

async function manualLogin() {
  console.log('Opening browser for manual Facebook login...');
  console.log('Please log in and wait for the feed to load.');
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();

  await page.goto('https://www.facebook.com');

  // Wait until user is logged in by checking for the feed/home elements
  console.log('Waiting for login... (up to 5 minutes)');
  console.log('After logging in, wait for the feed to fully load.');

  try {
    // Wait for any element that only appears when logged in
    await page.waitForSelector('[role="feed"], [aria-label="Facebook"], [data-pagelet="FeedUnit"]', { timeout: 300000 });
    console.log('Login detected! Saving session...');
  } catch {
    // Fallback: if selectors changed, just wait and let user press Enter
    console.log('Could not auto-detect login. Press Enter in this terminal when you are logged in...');
    await new Promise((resolve) => {
      process.stdin.once('data', resolve);
    });
  }

  // Give extra time for cookies to settle
  await new Promise((resolve) => setTimeout(resolve, 5000));

  await saveStorageState(context);
  console.log('Session saved successfully!');

  await browser.close();
}

manualLogin().catch(console.error);
