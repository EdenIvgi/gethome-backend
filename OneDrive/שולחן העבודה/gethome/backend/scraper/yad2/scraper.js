import { chromium } from 'playwright';
import { config } from '../../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, '.cookies.json');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return delay(min + Math.random() * (max - min));
}

async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('Yad2: Cookies saved.');
  } catch (e) {
    console.warn('Yad2: Failed to save cookies:', e.message);
  }
}

async function loadCookies(context) {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await context.addCookies(cookies);
      console.log('Yad2: Cookies loaded from previous session.');
      return true;
    }
  } catch (e) {
    console.warn('Yad2: Failed to load cookies:', e.message);
  }
  return false;
}

async function extractListingsFromPage(page) {
  // Scroll with human-like variation
  const scrollSteps = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < scrollSteps; i++) {
    const scrollAmount = 400 + Math.floor(Math.random() * 400);
    await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
    await randomDelay(600, 1200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await randomDelay(800, 1500);

  const listings = await page.evaluate(() => {
    const items = [];

    const cardLinks = document.querySelectorAll('a[href*="/realestate/item/"]');

    for (const card of cardLinks) {
      try {
        const container = card.closest('[class*="card_cardBox"]') || card;

        const url = card.href;
        const idMatch = url.match(/item\/[^/]+\/(\w+)/);
        const externalId = idMatch ? idMatch[1] : null;

        const priceEl = container.querySelector('[class*="feed-item-price_price"], [class*="price_price"]');
        let price = null;
        if (priceEl) {
          const cleaned = priceEl.textContent.replace(/[^\d]/g, '');
          price = cleaned ? parseInt(cleaned, 10) : null;
        }

        const allText = container.innerText || '';

        let rooms = null;
        const roomMatch = allText.match(/(\d+(?:\.\d)?)\s*חדר/);
        if (roomMatch) rooms = parseFloat(roomMatch[1]);

        let floor = null;
        const floorMatch = allText.match(/קומה\s*(\d+)/);
        if (floorMatch) floor = parseInt(floorMatch[1], 10);

        let areaSqm = null;
        const areaMatch = allText.match(/(\d+)\s*מ"ר/);
        if (areaMatch) areaSqm = parseInt(areaMatch[1], 10);

        const subtitleEl = container.querySelector('[class*="subtitle"], [class*="address"], [class*="location"], [class*="item-data"]');
        const locationText = subtitleEl?.textContent?.trim() || '';

        let city = 'תל אביב', neighborhood = null, street = null;
        if (locationText) {
          const parts = locationText.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 3) {
            street = parts[0]; neighborhood = parts[1]; city = parts[2];
          } else if (parts.length === 2) {
            neighborhood = parts[0]; city = parts[1];
          } else if (parts.length === 1) {
            city = parts[0];
          }
        }

        if (price && price >= 1000 && price <= 50000) {
          const key = externalId || `${price}-${rooms}`;
          if (!items.find(i => (i.externalId && i.externalId === externalId) || (!i.externalId && i.price === price && i.rooms === rooms))) {
            items.push({
              externalId, url, price, rooms, floor, areaSqm,
              city, neighborhood, street,
              description: allText.replace(/\s+/g, ' ').slice(0, 500),
            });
          }
        }
      } catch (e) {
        // skip malformed items
      }
    }

    return items;
  });

  return listings.map((l) => ({
    ...l,
    source: 'yad2',
    petsAllowed: null,
    parking: null,
    balcony: null,
    phone: null,
    images: [],
    scrapedAt: new Date(),
  }));
}

export async function scrapeYad2(maxPages) {
  maxPages = maxPages || config.yad2.maxPages;

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL',
  });

  // Load cookies from previous session
  await loadCookies(context);

  const page = await context.newPage();
  const allListings = [];

  const url = `https://www.yad2.co.il/realestate/rent?city=${config.yad2.cityId}`;
  console.log('Yad2: Navigating to Tel Aviv...');

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(5000, 8000);

    // Check for captcha/challenge
    const hasCaptcha = await page.$('iframe[src*="hcaptcha"], iframe[src*="captcha"]');
    if (hasCaptcha) {
      console.warn('Yad2: Captcha detected. Waiting 30s...');
      await delay(30000);
    }

    await page.waitForSelector('a[href*="/realestate/item/"]', { timeout: 15000 }).catch(() => null);

    const listings = await extractListingsFromPage(page);
    allListings.push(...listings);
    console.log(`Yad2: Tel Aviv - ${listings.length} listings found`);

    // Pagination
    for (let p = 2; p <= maxPages; p++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await randomDelay(1500, 3000);

        const nextBtn = await page.$(`button:has-text("${p}"), [class*="pagination"] :has-text("${p}")`);
        if (!nextBtn) break;

        await nextBtn.click();
        await randomDelay(5000, 10000);
        await page.waitForSelector('a[href*="/realestate/item/"]', { timeout: 10000 }).catch(() => null);

        const pageListings = await extractListingsFromPage(page);
        allListings.push(...pageListings);
        console.log(`Yad2: Tel Aviv page ${p} - ${pageListings.length} listings`);
      } catch {
        break;
      }
    }

    // Save cookies for next run
    await saveCookies(context);
  } catch (err) {
    console.error('Yad2 error:', err.message);
    // Still try to save cookies even on error
    await saveCookies(context);
  }

  await browser.close();
  return allListings;
}
