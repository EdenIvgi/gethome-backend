import { chromium } from 'playwright';
import { config } from '../config.js';
import { extractPostText, extractPostUrl, extractPostDate, extractPostImages, hashText, delay } from '../scraper/facebook/extractors.js';
import { classifyPost } from '../scraper/facebook/classifier.js';
import { isPostSeen, markPostSeen, insertListing, touchListingsByHash } from '../db/queries.js';
import { CircuitBreaker, RequestTracker } from './circuitBreaker.js';
import { matchAndNotify } from '../notifications/matchingEngine.js';
import { resolveArea } from '../scraper/shared.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FB_COOKIES_PATH = path.join(__dirname, '..', 'scraper', 'facebook', '.fb_cookies.json');

// ---------------------------------------------------------------------------
// GroupState – lightweight per-group metadata (no page ownership)
// ---------------------------------------------------------------------------
class GroupState {
  constructor(groupUrl) {
    this.groupUrl = groupUrl;
    this.seenThisSession = new Set();
    this.pollCount = 0;
    this.errorCount = 0;
    this.lastPollAt = null;
    this.nextEligibleAt = 0; // epoch ms – 0 means "ready now"
  }

  get shortUrl() {
    try { return new URL(this.groupUrl).pathname.split('/').filter(Boolean).pop(); }
    catch { return this.groupUrl.slice(-20); }
  }
}

// ---------------------------------------------------------------------------
// FacebookLiveListener – Tab Rotation Pool architecture
// ---------------------------------------------------------------------------
export class FacebookLiveListener {
  constructor() {
    this.browser = null;
    this.context = null;
    this.workers = [];          // { id, page, busy, currentGroup }
    this.groupStates = new Map(); // url → GroupState
    this.groupQueue = [];       // GroupState[] sorted by nextEligibleAt
    this.circuitBreaker = new CircuitBreaker('facebook', { failureThreshold: 5 });
    this.requestTracker = new RequestTracker();
    this.running = false;
    this._dispatchInterval = null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async start() {
    if (this.running) return;
    const groups = config.facebook.groups;
    if (groups.length === 0) {
      console.log('[FB Listener] No groups configured, skipping');
      return;
    }

    const workerCount = Math.min(config.listeners.fbWorkerCount, groups.length);
    console.log(`[FB Listener] Starting with ${groups.length} groups, ${workerCount} workers`);
    this.running = true;

    // Launch browser
    this.browser = await chromium.launch({ headless: true, channel: 'chrome' });
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'he-IL',
    });

    // Load saved cookies
    try {
      if (fs.existsSync(FB_COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(FB_COOKIES_PATH, 'utf-8'));
        await this.context.addCookies(cookies);
        console.log('[FB Listener] Cookies loaded');
      }
    } catch (e) {
      console.warn('[FB Listener] No cookies found, login required');
    }

    // Initialize group states with staggered start
    for (let i = 0; i < groups.length; i++) {
      const gs = new GroupState(groups[i]);
      gs.nextEligibleAt = Date.now() + i * 3000 + Math.random() * 5000;
      this.groupStates.set(groups[i], gs);
      this.groupQueue.push(gs);
    }
    this._sortQueue();

    // Create worker pages
    for (let i = 0; i < workerCount; i++) {
      const page = await this.context.newPage();
      this.workers.push({ id: i, page, busy: false, currentGroup: null });
    }

    // Start dispatch loop (every 2 seconds, check for idle workers)
    this._dispatchInterval = setInterval(() => this._dispatch(), 2000);
    console.log('[FB Listener] All workers ready');
  }

  async stop() {
    this.running = false;
    if (this._dispatchInterval) {
      clearInterval(this._dispatchInterval);
      this._dispatchInterval = null;
    }

    // Wait for busy workers (max 30s)
    const deadline = Date.now() + 30000;
    while (this.workers.some(w => w.busy) && Date.now() < deadline) {
      await delay(500);
    }

    // Save cookies
    if (this.context) {
      try {
        const cookies = await this.context.cookies();
        fs.writeFileSync(FB_COOKIES_PATH, JSON.stringify(cookies, null, 2));
      } catch {}
    }

    // Close browser
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
    }

    this.workers = [];
    this.groupQueue = [];
    this.groupStates.clear();
    console.log('[FB Listener] Stopped');
  }

  // -------------------------------------------------------------------------
  // Dispatch – assign idle workers to eligible groups
  // -------------------------------------------------------------------------
  _dispatch() {
    if (!this.running) return;

    const now = Date.now();

    for (const worker of this.workers) {
      if (worker.busy) continue;
      if (!this.circuitBreaker.canAttempt) break;
      if (this.requestTracker.shouldPause('facebook.com', 150)) break;

      // Find next eligible group
      const idx = this.groupQueue.findIndex(g => g.nextEligibleAt <= now);
      if (idx === -1) continue;

      const groupState = this.groupQueue.splice(idx, 1)[0];
      worker.busy = true;
      worker.currentGroup = groupState.groupUrl;
      this._pollGroup(worker, groupState)
        .catch(err => {
          console.error(`[FB:${groupState.shortUrl}] Worker ${worker.id} error: ${err.message}`);
        })
        .finally(() => {
          worker.busy = false;
          worker.currentGroup = null;
          this._computeNextEligible(groupState);
          this._enqueue(groupState);
        });
    }
  }

  _sortQueue() {
    this.groupQueue.sort((a, b) => a.nextEligibleAt - b.nextEligibleAt);
  }

  _enqueue(groupState) {
    this.groupQueue.push(groupState);
    this._sortQueue();
  }

  _computeNextEligible(groupState) {
    const hour = new Date().getHours();
    const isPeak = hour >= config.listeners.peakStartHour && hour < config.listeners.peakEndHour;
    const baseMs = config.listeners.fbPollIntervalMs;
    const multiplier = isPeak ? 1 : config.listeners.quietMultiplier;
    const jitter = Math.random() * 15000;
    let intervalMs = baseMs * multiplier + jitter;

    // 10% skip = double interval (same effect as skipping a cycle)
    if (Math.random() < 0.1) intervalMs *= 2;

    // Penalty for error-prone groups
    if (groupState.errorCount >= 5) intervalMs = Math.max(intervalMs, 300000); // 5 min min

    groupState.nextEligibleAt = Date.now() + intervalMs;
  }

  // -------------------------------------------------------------------------
  // Poll a single group using a worker page
  // -------------------------------------------------------------------------
  async _pollGroup(worker, groupState) {
    this.requestTracker.track('facebook.com');
    groupState.pollCount++;
    groupState.lastPollAt = Date.now();

    const page = worker.page;
    const tag = `[FB:${groupState.shortUrl}]`;

    try {
      // Navigate to group
      await page.goto(groupState.groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(4000);

      // Expand "See more" buttons
      try {
        const seeMoreBtns = await page.$$('div[role="button"]');
        for (const btn of seeMoreBtns.slice(0, 5)) {
          const btnText = await btn.textContent().catch(() => '');
          if (btnText.includes('עוד') && btnText.length < 15) {
            try { await btn.click(); await delay(300); } catch {}
          }
        }
      } catch {}

      // Read top-of-feed articles (NO scrolling)
      const posts = await page.$$('[role="article"]');
      const aliveEntries = [];
      const newPostsBatch = []; // posts needing LLM classification

      // ── Phase 1: Fast extraction (sequential, page-bound) ──
      for (const post of posts.slice(0, 15)) {
        const text = await extractPostText(post);
        if (!text || text.length < 30) continue;

        const textHash = hashText(text);
        const postDate = await extractPostDate(post);
        aliveEntries.push({ textHash, postedAt: postDate });

        if (groupState.seenThisSession.has(textHash)) continue;
        groupState.seenThisSession.add(textHash);
        if (isPostSeen(textHash)) continue;

        // Queue for Phase 2
        newPostsBatch.push({ post, text, textHash, postDate });
      }

      // ── Phase 2: Parallel LLM classification ──
      let newCount = 0;
      if (newPostsBatch.length > 0) {
        const CLASSIFY_CONCURRENCY = 5;
        const batch = newPostsBatch.slice(0, CLASSIFY_CONCURRENCY);

        const classifyResults = await Promise.allSettled(
          batch.map(({ text }) => classifyPost(text))
        );

        // Mark all as seen regardless of classification result
        for (const { textHash } of batch) {
          markPostSeen(textHash);
        }

        // ── Phase 3: Post-classification extraction (sequential, page-bound) ──
        for (let i = 0; i < classifyResults.length; i++) {
          const result = classifyResults[i];
          if (result.status !== 'fulfilled' || !result.value) continue;

          const parsed = result.value;
          const { post, text, textHash, postDate } = batch[i];

          try {
            const postUrl = await extractPostUrl(post);
            const images = await extractPostImages(post);

            parsed.externalId = null;
            parsed.url = postUrl || groupState.groupUrl;
            parsed.description = text.slice(0, 1000);
            parsed.textHash = textHash;
            parsed.images = images;
            parsed.postedAt = postDate || parsed.postedAt || null;
            parsed.scrapedAt = new Date();
            parsed.area = resolveArea(parsed.neighborhood);
            parsed.fingerprint = `fb-${textHash}`;

            const { id } = insertListing(parsed);
            newCount++;
            console.log(`${tag} NEW: ${parsed.city || '?'} | ${parsed.price || '?'}₪ | ${parsed.rooms || '?'}r | ${images.length} imgs`);

            matchAndNotify({ ...parsed, id });
          } catch (err) {
            console.error(`${tag} Post extraction error: ${err.message}`);
          }
        }
      }

      // Touch alive listings (update last_seen_at + posted_at)
      if (aliveEntries.length > 0) {
        touchListingsByHash(aliveEntries);
      }

      if (newCount > 0) {
        console.log(`${tag} Poll #${groupState.pollCount}: ${newCount} new apartments`);
      }

      this.circuitBreaker.recordSuccess();
      groupState.errorCount = 0;

    } catch (err) {
      groupState.errorCount++;
      console.error(`${tag} Poll error #${groupState.errorCount}: ${err.message}`);
      this.circuitBreaker.recordFailure(err.message);

      // If page is broken, recreate it
      if (groupState.errorCount >= 5) {
        console.log(`${tag} Too many errors, recreating worker page`);
        try {
          await page.close();
          worker.page = await this.context.newPage();
        } catch (e) {
          console.error(`${tag} Failed to recreate page: ${e.message}`);
        }
      }
    }

    // Cap seenThisSession to prevent memory leaks
    if (groupState.seenThisSession.size > 5000) {
      const entries = [...groupState.seenThisSession];
      groupState.seenThisSession = new Set(entries.slice(-3000));
    }
  }

  // -------------------------------------------------------------------------
  // Status reporting (same shape as before + worker info)
  // -------------------------------------------------------------------------
  getStatus() {
    return {
      running: this.running,
      workerCount: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      groups: Array.from(this.groupStates.values()).map(gs => ({
        url: gs.groupUrl,
        pollCount: gs.pollCount,
        errorCount: gs.errorCount,
        seenPosts: gs.seenThisSession.size,
        lastPollAt: gs.lastPollAt ? new Date(gs.lastPollAt).toISOString() : null,
        nextEligibleAt: gs.nextEligibleAt ? new Date(gs.nextEligibleAt).toISOString() : null,
      })),
      circuitBreaker: this.circuitBreaker.getStatus(),
      requests: this.requestTracker.getStatus(),
    };
  }
}
