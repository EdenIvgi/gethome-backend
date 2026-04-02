import { createHash } from 'crypto';
import { classifyPost } from './classifier.js';
import { isPostSeen, markPostSeen } from '../../db/queries.js';

const MAX_POSTS = 30;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractPostUrl(post) {
  return post.evaluate((el) => {
    // Facebook post permalinks live in <a> tags whose href contains
    // /groups/<id>/posts/<id> or /permalink/ or /story.php — but on the
    // modern SPA these are often the *timestamp* link (relative time like
    // "2h", "כ-3 שעות") which is the most reliable anchor.
    const allLinks = [...el.querySelectorAll('a[href]')];

    // 1. Direct post permalink patterns
    const postPatterns = ['/groups/', '/posts/', '/permalink/', '/story.php'];
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      // Must match a group-post pattern (not just the group itself)
      const matchCount = postPatterns.filter((p) => href.includes(p)).length;
      if (matchCount >= 2) {
        // It's a link like /groups/123/posts/456
        const full = a.href; // resolved absolute URL
        try {
          const url = new URL(full);
          url.search = '';
          return url.toString();
        } catch {
          return full.split('?')[0];
        }
      }
    }

    // 2. Timestamp link — usually an <a> inside a <span> with short text
    //    that contains a relative time. Its href points to the specific post.
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      const text = (a.innerText || '').trim();
      // Timestamp text is short and contains time indicators
      const isTimestamp =
        text.length < 25 &&
        (/\d/.test(text)) &&
        (/שע|דק|יו|שנ|ח[וו]?דש|minute|hour|day|week|month|yr|just now|עכשיו/i.test(text) ||
         /^\d+[hmd]$/.test(text));
      if (isTimestamp && href.length > 10 && !href.endsWith('#')) {
        const full = a.href;
        try {
          const url = new URL(full);
          url.search = '';
          return url.toString();
        } catch {
          return full.split('?')[0];
        }
      }
    }

    // 3. Any link whose aria-label looks like a date/time
    for (const a of allLinks) {
      const ariaLabel = a.getAttribute('aria-label') || '';
      if (/\d{1,2}/.test(ariaLabel) && /(january|february|march|april|may|june|july|august|september|october|november|december|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/i.test(ariaLabel)) {
        const full = a.href;
        try {
          const url = new URL(full);
          url.search = '';
          return url.toString();
        } catch {
          return full.split('?')[0];
        }
      }
    }

    return null;
  });
}

async function extractPostDate(post) {
  const relativeText = await post.evaluate((el) => {
    const allLinks = [...el.querySelectorAll('a[href]')];

    // 1. aria-label with full date (e.g. "March 19, 2026 at 3:45 PM" or "19 במרץ 2026 בשעה 15:45")
    for (const a of allLinks) {
      const label = a.getAttribute('aria-label') || '';
      if (/\d{1,2}/.test(label) && /(january|february|march|april|may|june|july|august|september|october|november|december|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/i.test(label)) {
        return { type: 'absolute', value: label };
      }
    }

    // 2. <abbr> with data-utime (Unix timestamp) — older FB layout
    const abbr = el.querySelector('abbr[data-utime]');
    if (abbr) {
      return { type: 'unix', value: abbr.getAttribute('data-utime') };
    }

    // 3. Relative time text from timestamp link ("לפני 2 שעות", "3h", "yesterday")
    for (const a of allLinks) {
      const text = (a.innerText || '').trim();
      const isTimestamp =
        text.length < 30 &&
        (/\d/.test(text)) &&
        (/שע|דק|יו|שנ|ח[וו]?דש|לפני|minute|hour|day|week|month|yr|just now|עכשיו|yesterday|אתמול/i.test(text) ||
         /^\d+[hmd]$/.test(text));
      if (isTimestamp) {
        return { type: 'relative', value: text };
      }
    }

    // 4. "Just now" / "עכשיו" text
    for (const a of allLinks) {
      const text = (a.innerText || '').trim();
      if (/^(just now|עכשיו|now)$/i.test(text)) {
        return { type: 'relative', value: text };
      }
    }

    return null;
  });

  if (!relativeText) return null;

  const now = new Date();

  if (relativeText.type === 'unix') {
    return new Date(parseInt(relativeText.value, 10) * 1000).toISOString();
  }

  if (relativeText.type === 'absolute') {
    // Try to parse English dates like "March 19, 2026 at 3:45 PM"
    const cleaned = relativeText.value.replace(/ at /i, ' ').replace(/ בשעה /i, ' ');
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();

    // Try Hebrew month parsing
    const hebrewMonths = {
      'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3, 'מאי': 4, 'יוני': 5,
      'יולי': 6, 'אוגוסט': 7, 'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11
    };
    for (const [heb, idx] of Object.entries(hebrewMonths)) {
      if (relativeText.value.includes(heb)) {
        const dayMatch = relativeText.value.match(/(\d{1,2})/);
        const yearMatch = relativeText.value.match(/(20\d{2})/);
        if (dayMatch) {
          const d = new Date(yearMatch ? parseInt(yearMatch[1]) : now.getFullYear(), idx, parseInt(dayMatch[1]));
          return d.toISOString();
        }
      }
    }
    return null;
  }

  if (relativeText.type === 'relative') {
    const val = relativeText.value.toLowerCase();

    if (/just now|עכשיו|now/i.test(val)) return now.toISOString();
    if (/אתמול|yesterday/i.test(val)) {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }

    // Parse "לפני X שעות", "X hours ago", "Xh", etc.
    const numMatch = val.match(/(\d+)/);
    if (!numMatch) return null;
    const num = parseInt(numMatch[1], 10);

    let msOffset = 0;
    if (/דק|minute|m(?:in)?$/i.test(val)) msOffset = num * 60 * 1000;
    else if (/שע|hour|h$/i.test(val)) msOffset = num * 60 * 60 * 1000;
    else if (/יו|day|d$/i.test(val)) msOffset = num * 24 * 60 * 60 * 1000;
    else if (/שבוע|week|w$/i.test(val)) msOffset = num * 7 * 24 * 60 * 60 * 1000;
    else if (/חודש|month/i.test(val)) msOffset = num * 30 * 24 * 60 * 60 * 1000;
    else if (/שנ|year|yr/i.test(val)) msOffset = num * 365 * 24 * 60 * 60 * 1000;

    if (msOffset > 0) return new Date(now.getTime() - msOffset).toISOString();
  }

  return null;
}

async function extractPostImages(post) {
  // Scroll the post into view to trigger lazy image loading
  await post.scrollIntoViewIfNeeded().catch(() => {});
  await delay(1000);

  return post.evaluate((el) => {
    const imgs = [];
    const seen = new Set();

    function addImage(src) {
      if (!src) return;
      const key = src.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);
      imgs.push(src);
    }

    // 1. Standard <img> tags — accept scontent, fbcdn, and external CDNs
    for (const img of el.querySelectorAll('img[src]')) {
      const src = img.src || '';
      // Skip tiny images (icons, emojis, profile pics)
      const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
      const h = img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10);
      if (w > 0 && w < 100) continue;
      if (h > 0 && h < 100) continue;
      // Skip profile pictures and reaction icons by common patterns
      if (src.includes('emoji') || src.includes('rsrc.php')) continue;
      // Accept content images (scontent CDN, fbcdn, or any large image)
      if (src.includes('scontent') || src.includes('fbcdn') || src.includes('external')) {
        addImage(src);
      }
    }

    // 2. Background images in style attributes (FB sometimes uses these for gallery)
    for (const div of el.querySelectorAll('div[style*="background-image"]')) {
      const style = div.getAttribute('style') || '';
      const match = style.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
      if (match && (match[1].includes('scontent') || match[1].includes('fbcdn'))) {
        addImage(match[1]);
      }
    }

    // 3. Links to images (FB wraps gallery images in <a> tags)
    for (const a of el.querySelectorAll('a[href*="photo"], a[href*="photos"]')) {
      const img = a.querySelector('img[src]');
      if (img) {
        const src = img.src || '';
        const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
        if (w > 0 && w < 50) continue;
        if (src.includes('scontent') || src.includes('fbcdn')) {
          addImage(src);
        }
      }
    }

    return imgs.slice(0, 8);
  });
}

async function extractPostText(post) {
  // Scroll post into view to trigger lazy loading
  await post.scrollIntoViewIfNeeded().catch(() => {});
  await delay(500);

  const text = await post.evaluate((el) => {
    // Skip placeholder/empty articles (Facebook uses empty articles as spacers)
    if (el.children.length <= 1 && el.querySelectorAll('div').length < 5) {
      return '';
    }

    const messageSelectors = [
      '[data-ad-comet-preview="message"]',
      '[data-ad-preview="message"]',
      'div[dir="auto"][style*="webkit"]',
      'div[dir="rtl"]',
    ];
    for (const sel of messageSelectors) {
      const msgEl = el.querySelector(sel);
      if (msgEl && msgEl.innerText && msgEl.innerText.length > 20) {
        return msgEl.innerText;
      }
    }
    const autoDivs = el.querySelectorAll('div[dir="auto"]');
    const parts = [];
    for (const div of autoDivs) {
      const t = div.innerText?.trim();
      if (t && t.length > 5) parts.push(t);
    }
    if (parts.length > 0) return parts.join('\n');
    // Last resort: full innerText (but only if substantial)
    const full = el.innerText || '';
    return full.length > 30 ? full : '';
  });
  return text;
}

export async function scrapeGroup(page, groupUrl) {
  const listings = [];
  const aliveHashes = []; // text hashes of posts still visible in group

  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(3000);

  const processedTexts = new Set(); // dedupe by text hash
  let scrollAttempts = 0;
  let noNewPostsCount = 0;
  let allSeenCount = 0; // track rounds where all posts were already in seen_posts

  while (listings.length < MAX_POSTS && scrollAttempts < 15) {
    // Expand "See more" buttons in viewport
    try {
      const seeMoreBtns = await page.$$('div[role="button"]');
      for (const btn of seeMoreBtns) {
        const btnText = await btn.textContent().catch(() => '');
        if (btnText.includes('עוד') && btnText.length < 15) {
          try { await btn.click(); await delay(300); } catch {}
        }
      }
    } catch {}
    await delay(500);

    const posts = await page.$$('[role="article"]');
    let newPostsThisRound = 0;

    for (const post of posts) {
      const text = await extractPostText(post);
      if (!text || text.length < 30) continue;

      // Dedupe by first 100 chars (in-memory for this run)
      const textKey = text.slice(0, 100);
      if (processedTexts.has(textKey)) continue;
      processedTexts.add(textKey);
      newPostsThisRound++;

      const textHash = createHash('sha256').update(text.slice(0, 200)).digest('hex').slice(0, 16);

      // Post is still visible in the group — extract date & mark alive
      const postDate = await extractPostDate(post);
      if (postDate) {
        console.log(`  [date] Found post date: ${postDate} for hash ${textHash.slice(0, 8)}`);
      }
      aliveHashes.push({ textHash, postedAt: postDate });

      // Skip LLM classification for posts already processed
      if (isPostSeen(textHash)) {
        continue;
      }

      // Use LLM to classify and extract data
      const parsed = await classifyPost(text);
      markPostSeen(textHash);
      if (parsed) {
        const postUrl = await extractPostUrl(post);
        if (!postUrl) {
          console.log('  [debug] Could not extract post URL, falling back to group URL');
        } else {
          console.log(`  [debug] Post URL: ${postUrl}`);
        }
        parsed.externalId = null;
        parsed.url = postUrl || groupUrl;
        parsed.description = text.slice(0, 1000);
        parsed.textHash = textHash;
        parsed.images = await extractPostImages(post);
        parsed.postedAt = postDate || null;
        parsed.scrapedAt = new Date();
        listings.push(parsed);
        console.log(`  [+] Apartment: ${parsed.city || '?'} | ${parsed.price || '?'}₪ | ${parsed.rooms || '?'} rooms | ${parsed.images.length} images | posted: ${parsed.postedAt || '?'}`);
      }

      if (listings.length >= MAX_POSTS) break;
    }

    console.log(`  Scroll ${scrollAttempts}: ${posts.length} articles, ${newPostsThisRound} new, ${processedTexts.size} processed, ${listings.length} apartments`);

    if (newPostsThisRound === 0) {
      noNewPostsCount++;
      if (noNewPostsCount >= 2) break; // Stop earlier (was 3)
    } else {
      noNewPostsCount = 0;
      // If we found new posts but ALL were already seen → likely no fresh content below
      const newUnseen = newPostsThisRound; // posts not in processedTexts
      // allSeenCount tracks consecutive rounds with zero new apartments found
      if (listings.length === 0 && scrollAttempts > 5) {
        allSeenCount++;
        if (allSeenCount >= 2) {
          console.log('  [opt] All posts already seen, stopping early');
          break;
        }
      }
    }

    // Scroll down to load more (reduced delay)
    await page.evaluate(() => window.scrollBy(0, 2500));
    await delay(1500 + Math.random() * 1500);
    scrollAttempts++;
  }

  return { listings, aliveHashes };
}

export async function scrapeGroups(context, groupUrls) {
  const allListings = [];
  const allAliveHashes = [];
  const page = await context.newPage();

  for (const url of groupUrls) {
    try {
      console.log(`Scraping FB group: ${url}`);
      const { listings, aliveHashes } = await scrapeGroup(page, url);
      allListings.push(...listings);
      allAliveHashes.push(...aliveHashes);
      console.log(`  Total: ${listings.length} apartment posts, ${aliveHashes.length} alive posts`);

      await delay(5000 + Math.random() * 5000);
    } catch (err) {
      console.error(`FB group error (${url}):`, err.message);
    }
  }

  await page.close();
  return { listings: allListings, aliveHashes: allAliveHashes };
}
