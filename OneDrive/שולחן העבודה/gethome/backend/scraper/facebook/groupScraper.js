import { classifyPost } from './classifier.js';

const MAX_POSTS = 30;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(4000);

  const processedTexts = new Set(); // dedupe by text hash
  let scrollAttempts = 0;
  let noNewPostsCount = 0;

  while (listings.length < MAX_POSTS && scrollAttempts < 20) {
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

      // Dedupe by first 100 chars
      const textKey = text.slice(0, 100);
      if (processedTexts.has(textKey)) continue;
      processedTexts.add(textKey);
      newPostsThisRound++;

      // Use LLM to classify and extract data
      const parsed = await classifyPost(text);
      if (parsed) {
        parsed.externalId = null;
        parsed.url = groupUrl;
        parsed.description = text.slice(0, 1000);
        parsed.images = [];
        parsed.scrapedAt = new Date();
        listings.push(parsed);
        console.log(`  [+] Apartment: ${parsed.city || '?'} | ${parsed.price || '?'}₪ | ${parsed.rooms || '?'} rooms`);
      }

      if (listings.length >= MAX_POSTS) break;
    }

    console.log(`  Scroll ${scrollAttempts}: ${posts.length} articles, ${newPostsThisRound} new, ${processedTexts.size} processed, ${listings.length} apartments`);

    if (newPostsThisRound === 0) {
      noNewPostsCount++;
      if (noNewPostsCount >= 3) break;
    } else {
      noNewPostsCount = 0;
    }

    // Scroll down to load more
    await page.evaluate(() => window.scrollBy(0, 2500));
    await delay(2000 + Math.random() * 2000);
    scrollAttempts++;
  }

  return listings;
}

export async function scrapeGroups(context, groupUrls) {
  const allListings = [];
  const page = await context.newPage();

  for (const url of groupUrls) {
    try {
      console.log(`Scraping FB group: ${url}`);
      const listings = await scrapeGroup(page, url);
      allListings.push(...listings);
      console.log(`  Total: ${listings.length} apartment posts`);

      await delay(5000 + Math.random() * 5000);
    } catch (err) {
      console.error(`FB group error (${url}):`, err.message);
    }
  }

  await page.close();
  return allListings;
}
