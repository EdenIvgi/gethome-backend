import { config } from '../../config.js';

// Flattened known TLV neighborhood names — Yad2 frequently stuffs the
// neighborhood into the `city` field ("פלורנטין", "לב תל אביב"). Used to
// detect that and move it back where it belongs.
const KNOWN_NEIGHBORHOODS = [...new Set(Object.values(config.telAvivAreas).flat())];

function isKnownNeighborhood(s) {
  if (!s) return false;
  const t = String(s).replace(/["'`׳״]/g, '').trim();
  return KNOWN_NEIGHBORHOODS.some((n) => t === n || t.includes(n));
}

// Junk neighborhood: digits glued to "דירה", no Hebrew at all, etc.
function isJunkNeighborhood(s) {
  if (!s) return true;
  const t = String(s).trim();
  return (
    t.length < 2 ||
    !/[֐-ת]/.test(t) ||
    /\d\s*דירה|דירה\s*\d|^\d/.test(t) ||
    /[₪]|מ"ר/.test(t)
  );
}

// Normalize a scraped Yad2 listing's city/neighborhood: recover a
// neighborhood wrongly placed in `city`, and drop junk neighborhoods.
function normalizeLocation(l) {
  let { city, neighborhood } = l;
  if (neighborhood && isJunkNeighborhood(neighborhood)) neighborhood = null;
  if ((!neighborhood || isJunkNeighborhood(neighborhood)) && isKnownNeighborhood(city)) {
    neighborhood = String(city).replace(/["'`׳״]/g, '').trim();
    city = 'תל אביב';
  }
  if (!city || isJunkNeighborhood(city)) city = 'תל אביב';
  return { ...l, city, neighborhood: neighborhood || null };
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min, max) {
  return delay(min + Math.random() * (max - min));
}

export async function extractListingsFromPage(page) {
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
        // innerText (not textContent) keeps line/element breaks so nested
        // price/room spans don't get glued onto the address ("500הירקון 14דירה").
        const rawLoc = (subtitleEl?.innerText || subtitleEl?.textContent || '').trim();
        let city = 'תל אביב', neighborhood = null, street = null;
        if (rawLoc) {
          // Reject obvious non-address tokens (price/room/size noise).
          const isJunk = (t) =>
            !t ||
            t.length < 2 ||
            /^\d+$/.test(t) ||
            /[₪]|מ"ר|מ׳ר|חדר|קומה|מיידי|כניסה|דירה\s*\d|^דירה$/.test(t) ||
            !/[֐-ת]/.test(t);
          const lines = rawLoc.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
          const addrLine =
            lines.find(l => l.includes(',') && !/[₪]|מ"ר|חדר|קומה/.test(l)) ||
            lines.find(l => /[֐-ת]/.test(l) && !/[₪]|מ"ר|חדר|קומה/.test(l)) ||
            '';
          const parts = addrLine.split(',').map(p => p.trim()).filter(p => !isJunk(p));
          if (parts.length >= 3) { street = parts[0]; neighborhood = parts[1]; city = parts[2]; }
          else if (parts.length === 2) { neighborhood = parts[0]; city = parts[1]; }
          else if (parts.length === 1) { neighborhood = parts[0]; }
        }
        const images = [];
        for (const img of container.querySelectorAll('img[src]')) {
          const src = img.src || '';
          // ACCEPT only listing-photo CDN paths. The site assets domain
          // (assets.yad2.co.il, .../yad2Logo.png) was leaking the header logo
          // into every listing as the "first image" — frontend then showed
          // the Yad2 logo on every card.
          const isListingPhoto =
            /img\.yad2\.co\.il\/Pic\//i.test(src) ||
            /\.y2\.co\.il\/(?:Pic|listing)/i.test(src) ||
            /ynet[^/]*\.co\.il\/.+\.(?:jpg|jpeg|png|webp)/i.test(src);
          if (!isListingPhoto) continue;
          const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
          if (w > 0 && w < 50) continue;
          images.push(src);
        }
        if (price && price >= 1000 && price <= 50000) {
          if (!items.find(i => (i.externalId && i.externalId === externalId) || (!i.externalId && i.price === price && i.rooms === rooms))) {
            items.push({ externalId, url, price, rooms, floor, areaSqm, city, neighborhood, street, images: images.slice(0, 5), description: allText.replace(/\s+/g, ' ').slice(0, 500) });
          }
        }
      } catch (e) { /* skip */ }
    }
    return items;
  });

  return listings.map((l) => ({
    ...normalizeLocation(l),
    source: 'yad2',
    petsAllowed: null,
    parking: null,
    balcony: null,
    phone: null,
    images: l.images || [],
    scrapedAt: new Date(),
  }));
}

export async function extractDetailPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(2000, 4000);
    for (let i = 0; i < 3; i++) {
      await page.evaluate((amount) => window.scrollBy(0, amount), 400 + Math.floor(Math.random() * 300));
      await randomDelay(500, 1000);
    }
    const detail = await page.evaluate(() => {
      const images = [];
      const seen = new Set();
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
      for (const source of document.querySelectorAll('picture source[srcset]')) {
        const srcset = source.srcset || '';
        const firstUrl = srcset.split(',')[0]?.trim()?.split(' ')[0];
        if (firstUrl && (firstUrl.includes('yad2') || firstUrl.includes('y2') || firstUrl.includes('ynet'))) {
          const key = firstUrl.split('?')[0];
          if (!seen.has(key)) { seen.add(key); images.push(firstUrl); }
        }
      }
      let description = '';
      const descSelectors = [
        '[class*="description_text"]', '[class*="content_text"]',
        '[class*="listing-content_desc"]', '[data-testid="description"]',
        '[class*="description"] p', '[class*="item-description"]',
        '[class*="collapsible_content"] span', '[class*="collapsible_content"]',
      ];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 20) { description = el.innerText.trim(); break; }
      }
      if (!description) {
        const mainContent = document.querySelector('main') || document.body;
        const divs = mainContent.querySelectorAll('div[dir="auto"], div[dir="rtl"], p');
        let longest = '';
        for (const div of divs) {
          const text = div.innerText?.trim() || '';
          if (text.length > longest.length && text.length > 30) longest = text;
        }
        if (longest.length > 30) description = longest;
      }
      const allText = document.body.innerText || '';
      let petsAllowed = null;
      if (/בעלי חיים|חיות מחמד/.test(allText)) petsAllowed = !/ללא בעלי חיים|ללא חיות/.test(allText);
      let parking = null;
      if (/חני[ה|י]/.test(allText)) parking = !/ללא חני[ה|י]|אין חני[ה|י]/.test(allText);
      let balcony = null;
      if (/מרפסת/.test(allText)) balcony = !/ללא מרפסת|אין מרפסת/.test(allText);
      return { images: images.slice(0, 10), description: description.slice(0, 1500), petsAllowed, parking, balcony };
    });
    return detail;
  } catch (err) {
    console.warn(`Yad2: Failed to scrape detail page ${url}: ${err.message}`);
    return null;
  }
}
