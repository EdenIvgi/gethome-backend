import { createHash } from 'crypto';

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hashText(text) {
  return createHash('sha256').update(text.slice(0, 200)).digest('hex').slice(0, 16);
}

export async function extractPostUrl(post) {
  return post.evaluate((el) => {
    const allLinks = [...el.querySelectorAll('a[href]')];
    const postPatterns = ['/groups/', '/posts/', '/permalink/', '/story.php'];
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      const matchCount = postPatterns.filter((p) => href.includes(p)).length;
      if (matchCount >= 2) {
        const full = a.href;
        try { const url = new URL(full); url.search = ''; return url.toString(); }
        catch { return full.split('?')[0]; }
      }
    }
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      const text = (a.innerText || '').trim();
      const isTimestamp =
        text.length < 25 && (/\d/.test(text)) &&
        (/שע|דק|יו|שנ|ח[וו]?דש|minute|hour|day|week|month|yr|just now|עכשיו/i.test(text) || /^\d+[hmd]$/.test(text));
      if (isTimestamp && href.length > 10 && !href.endsWith('#')) {
        const full = a.href;
        try { const url = new URL(full); url.search = ''; return url.toString(); }
        catch { return full.split('?')[0]; }
      }
    }
    for (const a of allLinks) {
      const ariaLabel = a.getAttribute('aria-label') || '';
      if (/\d{1,2}/.test(ariaLabel) && /(january|february|march|april|may|june|july|august|september|october|november|december|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/i.test(ariaLabel)) {
        const full = a.href;
        try { const url = new URL(full); url.search = ''; return url.toString(); }
        catch { return full.split('?')[0]; }
      }
    }
    return null;
  });
}

export async function extractPostDate(post) {
  const monthPattern = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)';
  const heMonthPattern = '(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)';
  const relativePattern = 'שע|דק|יו|שנ|ח[וו]?דש|לפני|minute|hour|day|week|month|yr|just now|עכשיו|yesterday|אתמול';

  const dateInfo = await post.evaluate((el, patterns) => {
    const { monthPat, heMonthPat, relPat } = patterns;
    const monthRe = new RegExp(monthPat, 'i');
    const heMonthRe = new RegExp(heMonthPat, 'i');
    const relRe = new RegExp(relPat, 'i');
    const shortRelRe = /^\d+[hmdws]$/i;

    // 1. Check aria-label on ALL elements (not just links) for absolute dates
    const candidates = el.querySelectorAll('a[href], span[aria-label], div[aria-label]');
    for (const node of candidates) {
      const label = node.getAttribute('aria-label') || '';
      if (label.length > 5 && label.length < 80 && /\d/.test(label) && (monthRe.test(label) || heMonthRe.test(label))) {
        return { type: 'absolute', value: label };
      }
    }

    // 2. Check for visible text with full date format ("March 25 at 12:08 PM")
    const allLinks = [...el.querySelectorAll('a[href]')];
    for (const a of allLinks) {
      const text = (a.innerText || '').trim();
      if (text.length > 5 && text.length < 60 && /\d/.test(text) && (monthRe.test(text) || heMonthRe.test(text))) {
        return { type: 'absolute', value: text };
      }
    }

    // 3. Unix timestamp (older FB format)
    const abbr = el.querySelector('abbr[data-utime]');
    if (abbr) return { type: 'unix', value: abbr.getAttribute('data-utime') };

    // 4. Relative time in links ("3d", "2h", "לפני 5 שעות")
    for (const a of allLinks) {
      const text = (a.innerText || '').trim();
      if (text.length < 30 && /\d/.test(text) && (relRe.test(text) || shortRelRe.test(text))) {
        return { type: 'relative', value: text };
      }
    }

    // 5. "just now" / "עכשיו" in links
    for (const a of allLinks) {
      const text = (a.innerText || '').trim();
      if (/^(just now|עכשיו|now)$/i.test(text)) return { type: 'relative', value: text };
    }

    // 6. Fallback: check ALL spans/divs in the post header area for timestamp text
    const headerArea = el.querySelector('h2, h3, [data-testid*="story"]')?.closest('div');
    if (headerArea) {
      const spans = headerArea.querySelectorAll('span, a');
      for (const sp of spans) {
        const text = (sp.innerText || '').trim();
        if (text.length > 3 && text.length < 50 && /\d/.test(text)) {
          if (monthRe.test(text) || heMonthRe.test(text)) return { type: 'absolute', value: text };
          if (shortRelRe.test(text) || relRe.test(text)) return { type: 'relative', value: text };
        }
      }
    }

    // 7. Last resort: scan first 20 spans for timestamp patterns
    const allSpans = el.querySelectorAll('span');
    for (let i = 0; i < Math.min(allSpans.length, 20); i++) {
      const sp = allSpans[i];
      const text = (sp.innerText || '').trim();
      if (text.length >= 2 && text.length <= 5 && shortRelRe.test(text)) {
        return { type: 'relative', value: text };
      }
    }

    return null;
  }, { monthPat: monthPattern, heMonthPat: heMonthPattern, relPat: relativePattern });

  if (!dateInfo) return null;
  const now = new Date();

  // Parse unix timestamp
  if (dateInfo.type === 'unix') return new Date(parseInt(dateInfo.value, 10) * 1000).toISOString();

  // Parse absolute dates: "March 25 at 12:08 PM", "March 25, 2026"
  if (dateInfo.type === 'absolute') {
    // Try direct parsing (handles "March 25, 2026 at 12:08 PM")
    const cleaned = dateInfo.value
      .replace(/ at /i, ' ')
      .replace(/ בשעה /i, ' ')
      .replace(/·/g, '')
      .trim();
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) return parsed.toISOString();

    // Try "Month Day" without year → assume current year
    const enMatch = cleaned.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/i);
    if (enMatch) {
      const withYear = `${enMatch[0]}, ${now.getFullYear()}`;
      const p2 = new Date(withYear);
      if (!isNaN(p2.getTime())) return p2.toISOString();
    }

    // Hebrew months
    const hebrewMonths = { 'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3, 'מאי': 4, 'יוני': 5, 'יולי': 6, 'אוגוסט': 7, 'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11 };
    for (const [heb, idx] of Object.entries(hebrewMonths)) {
      if (dateInfo.value.includes(heb)) {
        const dayMatch = dateInfo.value.match(/(\d{1,2})/);
        const yearMatch = dateInfo.value.match(/(20\d{2})/);
        if (dayMatch) {
          return new Date(yearMatch ? parseInt(yearMatch[1]) : now.getFullYear(), idx, parseInt(dayMatch[1])).toISOString();
        }
      }
    }

    // DD/MM/YYYY or DD.MM.YYYY format
    const dateMatch = dateInfo.value.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
    if (dateMatch) {
      let year = parseInt(dateMatch[3], 10);
      if (year < 100) year += 2000;
      return new Date(year, parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[1], 10)).toISOString();
    }

    return null;
  }

  // Parse relative times: "3d", "2h", "לפני 5 שעות"
  if (dateInfo.type === 'relative') {
    const val = dateInfo.value.toLowerCase();
    if (/just now|עכשיו|now/i.test(val)) return now.toISOString();
    if (/אתמול|yesterday/i.test(val)) return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const numMatch = val.match(/(\d+)/);
    if (!numMatch) return null;
    const num = parseInt(numMatch[1], 10);
    let msOffset = 0;
    if (/דק|minute|mins?$|m$/i.test(val)) msOffset = num * 60 * 1000;
    else if (/שע|hour|hrs?$|h$/i.test(val)) msOffset = num * 60 * 60 * 1000;
    else if (/יו|day|d$/i.test(val)) msOffset = num * 24 * 60 * 60 * 1000;
    else if (/שבוע|week|w$/i.test(val)) msOffset = num * 7 * 24 * 60 * 60 * 1000;
    else if (/חודש|month/i.test(val)) msOffset = num * 30 * 24 * 60 * 60 * 1000;
    else if (/שנ|year|yr|y$/i.test(val)) msOffset = num * 365 * 24 * 60 * 60 * 1000;
    // Fallback: if we have a number with 's' suffix (seconds)
    else if (/s$/i.test(val)) msOffset = num * 1000;
    if (msOffset > 0) return new Date(now.getTime() - msOffset).toISOString();
  }

  return null;
}

export async function extractPostImages(post) {
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
    for (const img of el.querySelectorAll('img[src]')) {
      const src = img.src || '';
      const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
      const h = img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10);
      if (w > 0 && w < 100) continue;
      if (h > 0 && h < 100) continue;
      if (src.includes('emoji') || src.includes('rsrc.php')) continue;
      if (src.includes('scontent') || src.includes('fbcdn') || src.includes('external')) addImage(src);
    }
    for (const div of el.querySelectorAll('div[style*="background-image"]')) {
      const style = div.getAttribute('style') || '';
      const match = style.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
      if (match && (match[1].includes('scontent') || match[1].includes('fbcdn'))) addImage(match[1]);
    }
    for (const a of el.querySelectorAll('a[href*="photo"], a[href*="photos"]')) {
      const img = a.querySelector('img[src]');
      if (img) {
        const src = img.src || '';
        const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10);
        if (w > 0 && w < 50) continue;
        if (src.includes('scontent') || src.includes('fbcdn')) addImage(src);
      }
    }
    return imgs.slice(0, 8);
  });
}

export async function extractPostText(post) {
  await post.scrollIntoViewIfNeeded().catch(() => {});
  await delay(500);
  const text = await post.evaluate((el) => {
    if (el.children.length <= 1 && el.querySelectorAll('div').length < 5) return '';
    const messageSelectors = [
      '[data-ad-comet-preview="message"]',
      '[data-ad-preview="message"]',
      'div[dir="auto"][style*="webkit"]',
      'div[dir="rtl"]',
    ];
    for (const sel of messageSelectors) {
      const msgEl = el.querySelector(sel);
      if (msgEl && msgEl.innerText && msgEl.innerText.length > 20) return msgEl.innerText;
    }
    const autoDivs = el.querySelectorAll('div[dir="auto"]');
    const parts = [];
    for (const div of autoDivs) {
      const t = div.innerText?.trim();
      if (t && t.length > 5) parts.push(t);
    }
    if (parts.length > 0) return parts.join('\n');
    const full = el.innerText || '';
    return full.length > 30 ? full : '';
  });
  return text;
}
