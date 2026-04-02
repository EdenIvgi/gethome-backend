import { chromium } from 'playwright';
import { config } from '../../config.js';
import { listingExistsWithData } from '../../db/queries.js';
import { createFingerprint } from '../../pipeline/deduplicator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DETAIL_POOL_SIZE = 3; // Number of parallel detail page workers

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, '.cookies.json');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return delay(min + Math.random() * (max - min));
}

// Yad2 neighborhood code → name mapping for Tel Aviv
const YAD2_NEIGHBORHOOD_MAP = {
  '2': 'הצפון הישן', '3': 'הצפון הישן', '5': 'הצפון החדש',
  '6': 'כוכב הצפון', '7': 'בבלי', '8': 'רמת אביב',
  '9': 'רמת אביב ג׳', '10': 'רמת אביב החדשה', '11': 'נווה אביבים',
  '12': 'אפקה', '13': 'רמת החייל', '14': 'לב העיר',
  '15': 'כרם התימנים', '16': 'נחלת בנימין', '17': 'פלורנטין',
  '18': 'נווה צדק', '19': 'שפירא', '20': 'נווה שאנן',
  '21': 'יפו', '22': 'יד אליהו', '23': 'נווה שרת',
  '24': 'קריית שלום', '25': 'התקווה', '26': 'עג׳מי',
};

// Map neighborhood → broad area
const NEIGHBORHOOD_TO_AREA = {
  'הצפון הישן': 'צפון תל אביב',
  'הצפון החדש': 'צפון תל אביב',
  'כוכב הצפון': 'צפון תל אביב',
  'פארק צמרת': 'צפון תל אביב',
  'בבלי': 'צפון תל אביב',
  'רמת אביב': 'צפון תל אביב',
  'רמת אביב ג׳': 'צפון תל אביב',
  'רמת אביב החדשה': 'צפון תל אביב',
  'נווה אביבים': 'צפון תל אביב',
  'אפקה': 'צפון תל אביב',
  'רמת החייל': 'מזרח תל אביב',
  'לב העיר': 'מרכז תל אביב',
  'כרם התימנים': 'מרכז תל אביב',
  'נחלת בנימין': 'מרכז תל אביב',
  'לילינבלום': 'מרכז תל אביב',
  'רוטשילד': 'מרכז תל אביב',
  'אלנבי': 'מרכז תל אביב',
  'דיזינגוף': 'מרכז תל אביב',
  'הבימה': 'מרכז תל אביב',
  'שרונה': 'מרכז תל אביב',
  'פלורנטין': 'דרום תל אביב',
  'נווה צדק': 'דרום תל אביב',
  'שפירא': 'דרום תל אביב',
  'נווה שאנן': 'דרום תל אביב',
  'קריית שלום': 'דרום תל אביב',
  'התקווה': 'דרום תל אביב',
  'נווה עופר': 'דרום תל אביב',
  'יפו': 'יפו',
  'עג׳מי': 'יפו',
  'נווה אופר': 'יפו',
  'יד אליהו': 'מזרח תל אביב',
  'נווה שרת': 'מזרח תל אביב',
  'מונטיפיורי': 'מזרח תל אביב',
  'גבעת הרצל': 'מזרח תל אביב',
};

/**
 * Parse Yad2 "עודכן" text into ISO date string.
 * Examples: "עודכן היום", "עודכן לפני 3 ימים", "עודכן ב-15/03/2026"
 */
function parseYad2Date(text) {
  if (!text) return null;
  const now = new Date();

  if (/עודכן היום|עודכן ממש עכשיו|פורסם היום/.test(text)) {
    return now.toISOString();
  }
  if (/אתמול/.test(text)) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }

  // "עודכן לפני X ימים/שעות/דקות"
  const relMatch = text.match(/לפני\s+(\d+)\s*(דק|שע|יו|ימים|שבוע|חודש)/);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    let ms = 0;
    if (/דק/.test(unit)) ms = num * 60 * 1000;
    else if (/שע/.test(unit)) ms = num * 60 * 60 * 1000;
    else if (/יו|ימים/.test(unit)) ms = num * 24 * 60 * 60 * 1000;
    else if (/שבוע/.test(unit)) ms = num * 7 * 24 * 60 * 60 * 1000;
    else if (/חודש/.test(unit)) ms = num * 30 * 24 * 60 * 60 * 1000;
    if (ms > 0) return new Date(now.getTime() - ms).toISOString();
  }

  // "עודכן ב-15/03/2026" or "15.03.2026"
  const dateMatch = text.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    let year = parseInt(dateMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day).toISOString();
  }

  return null;
}

/**
 * Try to extract neighborhood from Yad2 URL path.
 * URL format: /realestate/item/rent/CITY/NEIGHBORHOOD_CODE/LISTING_ID
 */
function extractNeighborhoodFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/realestate\/item\/[^/]+\/(\d+)\/(\d+)\//);
  if (match) {
    const code = match[2];
    return YAD2_NEIGHBORHOOD_MAP[code] || null;
  }
  return null;
}

/**
 * Resolve area from neighborhood name.
 */
function resolveArea(neighborhood) {
  if (!neighborhood) return null;
  // Direct match
  if (NEIGHBORHOOD_TO_AREA[neighborhood]) return NEIGHBORHOOD_TO_AREA[neighborhood];
  // Partial match (e.g. "הצפון הישן - ככר המדינה" → "הצפון הישן")
  for (const [key, area] of Object.entries(NEIGHBORHOOD_TO_AREA)) {
    if (neighborhood.includes(key) || key.includes(neighborhood)) return area;
  }
  return null;
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

async function extractDetailPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(2000, 4000);

    // Scroll to trigger lazy-loaded images
    for (let i = 0; i < 3; i++) {
      await page.evaluate((amount) => window.scrollBy(0, amount), 400 + Math.floor(Math.random() * 300));
      await randomDelay(500, 1000);
    }

    const detail = await page.evaluate(() => {
      // --- Images ---
      const images = [];
      const seen = new Set();

      // Gallery images (main carousel/gallery)
      for (const img of document.querySelectorAll('img[src]')) {
        const src = img.src || '';
        if (!src.includes('yad2') && !src.includes('y2') && !src.includes('ynet')) continue;
        const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
        if (w > 0 && w < 80) continue;
        const key = src.split('?')[0];
        if (seen.has(key)) continue;
        seen.add(key);
        images.push(src);
      }

      // Also check for gallery data in picture/source elements
      for (const source of document.querySelectorAll('picture source[srcset]')) {
        const srcset = source.srcset || '';
        const firstUrl = srcset.split(',')[0]?.trim()?.split(' ')[0];
        if (firstUrl && (firstUrl.includes('yad2') || firstUrl.includes('y2') || firstUrl.includes('ynet'))) {
          const key = firstUrl.split('?')[0];
          if (!seen.has(key)) {
            seen.add(key);
            images.push(firstUrl);
          }
        }
      }

      // --- Description ---
      let description = '';
      const descSelectors = [
        '[class*="description_text"]',
        '[class*="content_text"]',
        '[class*="listing-content_desc"]',
        '[data-testid="description"]',
        '[class*="description"] p',
        '[class*="item-description"]',
        '[class*="collapsible_content"] span',
        '[class*="collapsible_content"]',
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 20) {
          description = el.innerText.trim();
          break;
        }
      }
      if (!description) {
        const mainContent = document.querySelector('main') || document.body;
        const divs = mainContent.querySelectorAll('div[dir="auto"], div[dir="rtl"], p');
        let longest = '';
        for (const div of divs) {
          const text = div.innerText?.trim() || '';
          if (text.length > longest.length && text.length > 30) {
            longest = text;
          }
        }
        if (longest.length > 30) description = longest;
      }

      // --- Extra details (pets, parking, balcony, floor, area) ---
      const allText = document.body.innerText || '';

      let petsAllowed = null;
      if (/בעלי חיים|חיות מחמד/.test(allText)) {
        petsAllowed = !/ללא בעלי חיים|ללא חיות/.test(allText);
      }

      let parking = null;
      if (/חני[ה|י]/.test(allText)) {
        parking = !/ללא חני[ה|י]|אין חני[ה|י]/.test(allText);
      }

      let balcony = null;
      if (/מרפסת/.test(allText)) {
        balcony = !/ללא מרפסת|אין מרפסת/.test(allText);
      }

      let elevator = null;
      if (/מעלית/.test(allText)) {
        elevator = !/ללא מעלית|אין מעלית/.test(allText);
      }

      let furnished = null;
      if (/ריהוט|מרוהט|מרוהטת/.test(allText)) {
        furnished = true;
      }

      // --- Location: neighborhood + area from detail page ---
      let neighborhood = null;
      let area = null;
      let street = null;

      // Yad2 detail pages show breadcrumbs or address with: street, neighborhood, city
      const addressSelectors = [
        '[class*="address_label"]',
        '[class*="address_text"]',
        '[class*="location_text"]',
        '[data-testid="address"]',
        '[class*="main-title_address"]',
        '[class*="item-address"]',
        'h2[class*="address"]',
      ];
      for (const sel of addressSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 3) {
          const parts = el.innerText.trim().split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 3) {
            street = parts[0];
            neighborhood = parts[1];
          } else if (parts.length === 2) {
            // Could be "street, neighborhood" or "neighborhood, city"
            const second = parts[1];
            if (/תל.?אביב|ת"א/i.test(second)) {
              neighborhood = parts[0];
            } else {
              street = parts[0];
              neighborhood = parts[1];
            }
          }
          break;
        }
      }

      // Also try breadcrumbs which often have area > neighborhood
      const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav[aria-label*="breadcrumb"] a, [class*="bread"] a');
      const crumbs = [...breadcrumbs].map(a => a.innerText?.trim()).filter(Boolean);
      // Breadcrumbs: "דירות להשכרה" > "תל אביב יפו" > "צפון תל אביב" > "הצפון הישן"
      if (crumbs.length >= 3) {
        for (let i = 0; i < crumbs.length; i++) {
          if (/צפון תל|דרום תל|מרכז תל|מזרח תל|יפו|רמת (אביב|החייל)|בבלי|נווה אביבים|פלורנטין/.test(crumbs[i])) {
            area = crumbs[i];
            if (crumbs[i + 1] && !/דירה|חדר|להשכרה/.test(crumbs[i + 1])) {
              neighborhood = crumbs[i + 1];
            }
            break;
          }
        }
      }

      // --- Posted date: "עודכן היום" / "עודכן לפני X ימים" ---
      let updatedText = null;
      const updateSelectors = [
        '[class*="date"]',
        '[class*="updated"]',
        '[class*="publish"]',
        '[class*="time-ago"]',
        '[data-testid*="date"]',
      ];
      for (const sel of updateSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          const text = el.innerText.trim();
          if (/עודכן|פורסם|תאריך/.test(text)) {
            updatedText = text;
            break;
          }
        }
      }
      // Fallback: search all text for update pattern
      if (!updatedText) {
        const allElements = document.querySelectorAll('span, div, p');
        for (const el of allElements) {
          const text = el.innerText?.trim() || '';
          if (text.length < 200 && /עודכן|פורסם/.test(text)) {
            updatedText = text;
            break;
          }
        }
      }

      return {
        images: images.slice(0, 10),
        description: description.slice(0, 1500),
        petsAllowed,
        parking,
        balcony,
        elevator,
        furnished,
        neighborhood,
        area,
        street,
        updatedText,
      };
    });

    // Parse updatedText into ISO date
    if (detail.updatedText) {
      detail.postedAt = parseYad2Date(detail.updatedText);
    }

    return detail;
  } catch (err) {
    console.warn(`Yad2: Failed to scrape detail page ${url}: ${err.message}`);
    return null;
  }
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

        // --- Location extraction ---
        // Try multiple selectors for the address line on Yad2 cards
        let city = 'תל אביב', neighborhood = null, street = null;
        const addressSelectors = [
          '[class*="subtitle"]',
          '[class*="address"]',
          '[class*="location"]',
          '[class*="item-data_info"] > span:first-child',
          '[class*="card_locationText"]',
        ];
        let locationText = '';
        for (const sel of addressSelectors) {
          const el = container.querySelector(sel);
          if (el) {
            const text = el.textContent?.trim() || '';
            // Must look like an address (has Hebrew, has commas or known words)
            if (text.length > 3 && text.length < 150 && /[א-ת]/.test(text)) {
              // Skip if it's clearly not an address (has property types glued to it)
              if (/^\d{1,3}[א-ת]/.test(text) && !/,/.test(text)) continue;
              locationText = text;
              break;
            }
          }
        }

        if (locationText && locationText.includes(',')) {
          const parts = locationText.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 3) {
            street = parts[0]; neighborhood = parts[1]; city = parts[2];
          } else if (parts.length === 2) {
            // "neighborhood, city" or "street, neighborhood"
            if (/תל.?אביב|ת"א/.test(parts[1])) {
              neighborhood = parts[0];
            } else {
              street = parts[0]; neighborhood = parts[1];
            }
          } else if (parts.length === 1) {
            city = parts[0];
          }
        }

        // Try to extract neighborhood from URL path
        if (!neighborhood && url) {
          const urlNeighborhood = (() => {
            const m = url.match(/\/item\/[^/]+\/(\d+)\/(\d+)/);
            if (m) {
              const neighborhoodMap = {
                '2': 'הצפון הישן', '3': 'הצפון הישן', '5': 'הצפון החדש',
                '6': 'כוכב הצפון', '7': 'בבלי', '8': 'רמת אביב',
                '9': 'רמת אביב ג׳', '10': 'רמת אביב החדשה', '11': 'נווה אביבים',
                '12': 'אפקה', '13': 'רמת החייל', '14': 'לב העיר',
                '15': 'כרם התימנים', '16': 'נחלת בנימין', '17': 'פלורנטין',
                '18': 'נווה צדק', '19': 'שפירא', '20': 'נווה שאנן',
                '21': 'יפו', '22': 'יד אליהו', '23': 'נווה שרת',
              };
              return neighborhoodMap[m[2]] || null;
            }
            return null;
          })();
          if (urlNeighborhood) neighborhood = urlNeighborhood;
        }

        // Clean neighborhood: strip leading digits and trailing property type
        if (neighborhood) {
          neighborhood = neighborhood
            .replace(/^\d+/, '')
            .replace(/(דירה|דירת גן|גג.*פנטה?אוז|סטודיו.*|דופלקס|בית.*|מרתף.*|סאבלט|מחסן|לופט)$/i, '')
            .trim();
          if (neighborhood.length < 2) neighborhood = null;
        }

        // Extract images from the listing card
        const images = [];
        for (const img of container.querySelectorAll('img[src]')) {
          const src = img.src || '';
          if (src.includes('yad2') || src.includes('y2') || src.includes('ynet')) {
            const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
            if (w > 0 && w < 50) continue;
            images.push(src);
          }
        }

        // Extract "עודכן" date from card text
        let updatedText = null;
        const updateMatch = allText.match(/(עודכן[^\n]{3,40})/);
        if (updateMatch) updatedText = updateMatch[1].trim();
        
        // Also try to extract relative times like "לפני 5 דקות"
        if (!updatedText) {
          const relativeMatch = allText.match(/(לפניs+d+s+(?:דקה|דקות|שעה|שעות|יום|ימים|שבוע|שבועות|חודש|חודשים))/);
          if (relativeMatch) updatedText = relativeMatch[1];
        }
        if (price && price >= 1000 && price <= 50000) {
          const key = externalId || `${price}-${rooms}`;
          if (!items.find(i => (i.externalId && i.externalId === externalId) || (!i.externalId && i.price === price && i.rooms === rooms))) {
            items.push({
              externalId, url, price, rooms, floor, areaSqm,
              city, neighborhood, street,
              images: images.slice(0, 5),
              description: allText.replace(/\s+/g, ' ').slice(0, 500),
              updatedText,
            });
          }
        }
      } catch (e) {
        // skip malformed items
      }
    }

    return items;
  });

  return listings.map((l) => {
    // Resolve area from neighborhood
    const area = resolveArea(l.neighborhood);
    // Parse date from card text
    const postedAt = l.updatedText ? parseYad2Date(l.updatedText) : null;
    return {
      ...l,
      source: 'yad2',
      area: area || null,
      petsAllowed: null,
      parking: null,
      balcony: null,
      phone: null,
      images: l.images || [],
      postedAt,
      scrapedAt: new Date(),
    };
  });
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

    // --- Visit detail pages (optimized: skip existing, skip if card has data, parallel pool) ---
    if (allListings.length > 0) {
      // Filter: which listings actually need a detail page visit?
      const needsDetail = [];
      let skippedExisting = 0;
      let skippedComplete = 0;

      for (const listing of allListings) {
        if (!listing.url) continue;

        // Opt 2: Skip if listing already exists in DB with full data
        const fp = createFingerprint({ source: 'yad2', externalId: listing.externalId, price: listing.price, rooms: listing.rooms, city: listing.city });
        const existing = listingExistsWithData(fp);
        if (existing && existing.hasImages && existing.hasDescription) {
          skippedExisting++;
          continue;
        }

        // Opt 6: Skip if card already has enough images and description
        if (listing.images.length >= 2 && listing.description && listing.description.length > 100) {
          skippedComplete++;
          continue;
        }

        needsDetail.push(listing);
      }

      console.log(`Yad2: ${needsDetail.length} detail pages needed (skipped: ${skippedExisting} existing, ${skippedComplete} complete cards, ${allListings.length} total)`);

      // Opt 1: Parallel detail page pool
      if (needsDetail.length > 0) {
        const pages = [];
        for (let i = 0; i < Math.min(DETAIL_POOL_SIZE, needsDetail.length); i++) {
          pages.push(await context.newPage());
        }

        // Process in batches of DETAIL_POOL_SIZE
        for (let i = 0; i < needsDetail.length; i += DETAIL_POOL_SIZE) {
          const batch = needsDetail.slice(i, i + DETAIL_POOL_SIZE);
          const batchNum = Math.floor(i / DETAIL_POOL_SIZE) + 1;
          const totalBatches = Math.ceil(needsDetail.length / DETAIL_POOL_SIZE);
          console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} pages`);

          const results = await Promise.all(
            batch.map((listing, idx) => extractDetailPage(pages[idx % pages.length], listing.url))
          );

          // Merge results into listings
          for (let j = 0; j < batch.length; j++) {
            const listing = batch[j];
            const detail = results[j];
            if (detail) {
              if (detail.images.length > 0) listing.images = detail.images;
              if (detail.description) listing.description = detail.description;
              if (detail.petsAllowed != null) listing.petsAllowed = detail.petsAllowed;
              if (detail.parking != null) listing.parking = detail.parking;
              if (detail.balcony != null) listing.balcony = detail.balcony;
              if (detail.elevator != null) listing.elevator = detail.elevator;
              if (detail.furnished != null) listing.furnished = detail.furnished;
              if (detail.neighborhood && !listing.neighborhood) listing.neighborhood = detail.neighborhood;
              if (detail.area) listing.area = detail.area;
              if (detail.street && !listing.street) listing.street = detail.street;
              if (detail.postedAt) listing.postedAt = detail.postedAt;
              if (listing.neighborhood && !listing.area) {
                listing.area = resolveArea(listing.neighborhood) || null;
              }
            }
          }

          // Delay between batches (not after last batch)
          if (i + DETAIL_POOL_SIZE < needsDetail.length) {
            await randomDelay(2000, 4000);
          }
        }

        for (const p of pages) await p.close();
      }
    }
  } catch (err) {
    console.error('Yad2 error:', err.message);
    // Still try to save cookies even on error
    await saveCookies(context);
  }

  await browser.close();
  return allListings;
}
