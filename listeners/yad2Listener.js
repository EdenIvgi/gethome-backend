import { chromium } from 'playwright';
import { config } from '../config.js';
import { extractListingsFromPage, extractDetailPage, randomDelay, delay } from '../scraper/yad2/extractors.js';
import { buildAggregatedUrls } from '../scraper/yad2/urlBuilder.js';
import { insertListing, touchListingsByHash } from '../db/queries.js';
import { CircuitBreaker, RequestTracker } from './circuitBreaker.js';
import { matchAndNotify } from '../notifications/matchingEngine.js';
import { resolveArea } from '../scraper/shared.js';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YAD2_COOKIES_PATH = path.join(__dirname, '..', 'scraper', 'yad2', '.cookies.json');

export class Yad2LiveListener {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.circuitBreaker = new CircuitBreaker('yad2', { failureThreshold: 3 });
    this.requestTracker = new RequestTracker();
    this.seenExternalIds = new Set();
    this.running = false;
    this.pollCount = 0;
    this._pollTimeout = null;
  }

  async start() {
    if (this.running) return;
    console.log('[Yad2 Listener] Starting');
    this.running = true;

    this.browser = await chromium.launch({ headless: true, channel: 'chrome' });
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'he-IL',
    });

    // Load cookies
    try {
      if (fs.existsSync(YAD2_COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(YAD2_COOKIES_PATH, 'utf-8'));
        await this.context.addCookies(cookies);
      }
    } catch {}

    this.page = await this.context.newPage();
    this.schedulePoll();
    console.log('[Yad2 Listener] Running');
  }

  schedulePoll() {
    if (!this.running) return;

    const hour = new Date().getHours();
    const isPeak = hour >= config.listeners.peakStartHour && hour < config.listeners.peakEndHour;
    const baseMs = config.listeners.yad2PollIntervalMs;
    const multiplier = isPeak ? 1 : config.listeners.quietMultiplier;
    const jitter = Math.random() * 60000;
    const intervalMs = baseMs * multiplier + jitter;

    this._pollTimeout = setTimeout(async () => {
      if (!this.running) return;
      await this.poll();
      this.schedulePoll();
    }, intervalMs);
  }

  async poll() {
    if (!this.circuitBreaker.canAttempt) {
      console.log('[Yad2 Listener] Circuit breaker OPEN, skipping');
      return;
    }
    if (this.requestTracker.shouldPause('yad2.co.il', 30)) {
      console.log('[Yad2 Listener] Rate limit reached, pausing');
      return;
    }

    this.pollCount++;
    this.requestTracker.track('yad2.co.il');

    try {
      // Build aggregated URLs from all users' preferences
      const targets = buildAggregatedUrls();

      for (const { url } of targets) {
        console.log(`[Yad2 Listener] Poll #${this.pollCount}: ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(5000, 8000);

        // Check for captcha
        const hasCaptcha = await this.page.$('iframe[src*="hcaptcha"], iframe[src*="captcha"]');
        if (hasCaptcha) {
          console.warn('[Yad2 Listener] Captcha detected!');
          this.circuitBreaker.recordFailure('captcha');
          await this.saveCookies();
          return;
        }

        await this.page.waitForSelector('a[href*="/realestate/item/"]', { timeout: 15000 }).catch(() => null);
        const listings = await extractListingsFromPage(this.page);

        // Touch ALL visible listings as alive (including previously seen)
        const aliveEntries = [];
        for (const listing of listings) {
          const textForHash = `${listing.externalId || ''}${listing.price}${listing.rooms}${listing.neighborhood || ''}`;
          const textHash = createHash('sha256').update(textForHash).digest('hex').slice(0, 16);
          aliveEntries.push({ textHash, postedAt: null });
        }
        if (aliveEntries.length > 0) {
          touchListingsByHash(aliveEntries);
        }

        let newCount = 0;
        const detailPage = await this.context.newPage();
        const detailsToFetch = [];

        for (const listing of listings) {
          const id = listing.externalId || `${listing.price}-${listing.rooms}-${listing.floor}`;
          if (this.seenExternalIds.has(id)) continue;
          this.seenExternalIds.add(id);
          newCount++;
          detailsToFetch.push(listing);
        }

        // Visit up to 5 detail pages per cycle
        for (const listing of detailsToFetch.slice(0, 5)) {
          if (!listing.url) continue;
          this.requestTracker.track('yad2.co.il');
          const detail = await extractDetailPage(detailPage, listing.url);
          if (detail) {
            if (detail.images.length > 0) listing.images = detail.images;
            if (detail.description) listing.description = detail.description;
            if (detail.petsAllowed != null) listing.petsAllowed = detail.petsAllowed;
            if (detail.parking != null) listing.parking = detail.parking;
            if (detail.balcony != null) listing.balcony = detail.balcony;
          }
          await randomDelay(2000, 4000);
        }
        await detailPage.close();

        // Insert new listings and notify
        for (const listing of detailsToFetch) {
          listing.area = resolveArea(listing.neighborhood);
          const textForHash = `${listing.externalId || ''}${listing.price}${listing.rooms}${listing.neighborhood || ''}`;
          listing.textHash = createHash('sha256').update(textForHash).digest('hex').slice(0, 16);
          listing.fingerprint = listing.externalId ? `yad2-${listing.externalId}` : `yad2-${listing.textHash}`;
          listing.postedAt = new Date().toISOString(); // Yad2 listings on page 1 are recent

          const { id } = insertListing(listing);
          console.log(`[Yad2] NEW: ${listing.neighborhood || '?'} | ${listing.price}₪ | ${listing.rooms}r`);
          matchAndNotify({ ...listing, id });
        }

        console.log(`[Yad2 Listener] Found ${listings.length} total, ${newCount} new`);
      }

      await this.saveCookies();
      this.circuitBreaker.recordSuccess();
    } catch (err) {
      console.error(`[Yad2 Listener] Poll error: ${err.message}`);
      this.circuitBreaker.recordFailure(err.message);
    }
  }

  async saveCookies() {
    try {
      if (this.context) {
        const cookies = await this.context.cookies();
        fs.writeFileSync(YAD2_COOKIES_PATH, JSON.stringify(cookies, null, 2));
      }
    } catch {}
  }

  async stop() {
    this.running = false;
    if (this._pollTimeout) clearTimeout(this._pollTimeout);
    await this.saveCookies();
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.page = null;
    }
    console.log('[Yad2 Listener] Stopped');
  }

  getStatus() {
    return {
      running: this.running,
      pollCount: this.pollCount,
      seenListings: this.seenExternalIds.size,
      circuitBreaker: this.circuitBreaker.getStatus(),
      requests: this.requestTracker.getStatus(),
    };
  }
}
