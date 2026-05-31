import Groq from 'groq-sdk';
import { config } from '../../config.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Canonical Tel Aviv neighborhood names the model is allowed to return — kept
// in sync with config.telAvivAreas so resolveArea() can map them to an area.
const KNOWN_NEIGHBORHOODS_LIST = [
  ...new Set(Object.values(config.telAvivAreas).flat()),
];
const KNOWN_NEIGHBORHOODS = KNOWN_NEIGHBORHOODS_LIST.join(', ');

// Known TLV streets — used by heuristic mode to detect a street mention.
const KNOWN_STREETS_LIST = [
  ...new Set(Object.values(config.telAvivStreets || {}).flat()),
];

const SYSTEM_PROMPT = `אתה מסווג מודעות דירות להשכרה מקבוצות פייסבוק בישראל.
קיבלת טקסט של פוסט. החלט האם זו מודעת דירה למגורים להשכרה וחלץ פרטים.

ענה אך ורק ב-JSON תקני:
{"isApartment":true/false,"price":number|null,"rooms":number|null,"city":"string"|null,"neighborhood":"string"|null,"street":"string"|null,"floor":number|null,"areaSqm":number|null,"phone":"string"|null,"petsAllowed":true/false/null,"parking":true/false/null,"balcony":true/false/null,"postedAt":"YYYY-MM-DD"|null}

כללי מיקום (חשוב מאוד):
- "neighborhood" = שם שכונה מוכר בלבד, בדיוק אחד מהשמות הבאים: ${KNOWN_NEIGHBORHOODS}.
- אם השכונה לא נכתבת במפורש אבל מצוין רחוב, צומת, ציון דרך או תיאור מיקום בתל אביב (למשל "ברחוב פרנקל פינת העלייה", "ליד דיזנגוף סנטר", "מטר משוק לוינסקי") — הסק בעצמך את השכונה הנכונה לפי הידע הגאוגרפי שלך על תל אביב, והחזר את שם השכונה המתאים מהרשימה. דוגמאות: "פרנקל"/"וושינגטון" → פלורנטין; "דיזנגוף"/"בוגרשוב"/"בר כוכבא"/"ז׳בוטינסקי"/"שדרות בן גוריון" → לב העיר; "שוק לוינסקי" → שפירא; "שדרות רוטשילד" → לב העיר; "אבן גבירול צפון"/"כיכר המדינה" → הצפון החדש.
- החזר neighborhood=null רק אם באמת אי אפשר להסיק שכונה משום פרט בטקסט.
- "street" = שם הרחוב בלבד (למשל "פרנקל", "דיזנגוף", "שדרות בן גוריון"). תמיד מלא street אם מוזכר רחוב, גם כאשר הסקת neighborhood ממנו.
- "city" = שם העיר בלבד (למשל "תל אביב", "רמת גן"). אל תכניס עיר או רחוב לשדה neighborhood.
- אסור להחזיר ב-neighborhood: שם עיר, שם רחוב, או שבר משפט כמו "בלב", "לב", "מרכז", "ליד", "באזור".

postedAt: אם יש תאריך פרסום (לא תאריך כניסה), חלץ אותו בפורמט YYYY-MM-DD. היום זה ${new Date().toISOString().split('T')[0]}.

מודעות דירה (isApartment=true): השכרת דירה למגורים, סאבלט, שותפים, דירה למסירה.
לא מודעה (isApartment=false): ניקיון, הובלות, שיפוצים, רהיטים, שאלות, וכן נכס מסחרי — חנות, משרד, קליניקה, מחסן, מגרש/חניה, אולם, נכס מסחרי או דירה למכירה (לא להשכרה).`;

// Pre-filter: quick keyword check before sending to LLM
const QUICK_KEYWORDS = [
  'להשכרה', 'לשכירות', 'דירה', 'חדרים', 'חדר', 'דירת',
  'למסירה', 'שכ"ד', 'שכירות', 'room', 'apartment',
  'studio', 'סטודיו', 'פנטהאוז', 'דופלקס', 'מיני פנט', 'גג',
];

// Hard rejects: when these patterns appear in heuristic mode we refuse the post
// even if the keyword filter passed. Catches the "not a rental" cases the LLM
// would normally reject.
const REJECT_KEYWORDS = [
  'למכירה', 'מחפש דירה', 'מחפשת דירה', 'מחפשים דירה',
  'חנות', 'משרד', 'קליניקה', 'אולם',
];

export function mightBeApartment(text) {
  const lower = text.toLowerCase();
  return QUICK_KEYWORDS.some((kw) => lower.includes(kw));
}

function isLikelyRejected(text) {
  return REJECT_KEYWORDS.some((kw) => text.includes(kw));
}

// =====================================================================
// Heuristic classifier — used when SCRAPE_NO_LLM=true.
// Pure regex/keyword extraction, zero API calls. Lower data quality than
// the LLM (city/street/postedAt mostly null) but useful when Groq is down,
// rate-limited, or when you just want to see raw recall.
// =====================================================================
export function heuristicClassify(text) {
  if (!text || text.length < 20) return null;
  if (!mightBeApartment(text)) return null;
  if (isLikelyRejected(text)) return null;

  // --- Price (must be plausible 1000-50000). Currency token: ש"ח / ש״ח / שח /
  //     ₪ / שקל / nis — all variants normalized via the regex alternation.
  const CURRENCY = '(?:₪|ש["׳״]?ח|שקלים?|nis)';
  let price = null;
  const priceMatches = [
    text.match(new RegExp(`(\\d{1,2}[,.]?\\d{3})\\s*${CURRENCY}`, 'i')),
    text.match(new RegExp(`${CURRENCY}\\s*(\\d{1,2}[,.]?\\d{3})`, 'i')),
    text.match(/(?:מחיר|שכ["׳״]?ד|שכר דירה|מחיר השכירות)[^\d]{0,15}(\d{4,5})/i),
  ];
  for (const m of priceMatches) {
    if (!m) continue;
    const num = parseInt(m[1].replace(/[,.]/g, ''), 10);
    if (num >= 1000 && num <= 50000) { price = num; break; }
  }

  // --- Rooms ---
  let rooms = null;
  const roomsMatch = text.match(/(\d+(?:\.\d)?)\s*חדר/);
  if (roomsMatch) {
    const r = parseFloat(roomsMatch[1]);
    if (r >= 0.5 && r <= 10) rooms = r;
  }

  // --- Floor ---
  let floor = null;
  const floorMatch = text.match(/קומה\s*(\d+)/);
  if (floorMatch) floor = parseInt(floorMatch[1], 10);

  // --- Area sqm ---
  let areaSqm = null;
  const areaMatch = text.match(/(\d{2,3})\s*מ[׳"]?ר/);
  if (areaMatch) {
    const a = parseInt(areaMatch[1], 10);
    if (a >= 15 && a <= 500) areaSqm = a;
  }

  // --- Phone (Israeli mobile) ---
  let phone = null;
  const phoneMatch = text.match(/0\s*5\d[\s\-.]?\d{3}[\s\-.]?\d{4}/);
  if (phoneMatch) phone = phoneMatch[0].replace(/[\s\-.]/g, '');

  // --- Amenities ---
  const petsAllowed = /חיות מחמד|בעלי חיים|חתול|כלב/.test(text)
    ? !/ללא בעלי חיים|ללא חיות|אסור.*חיות|לא מקבל.*חיות/.test(text)
    : null;
  const parking = /חני[הי]/.test(text)
    ? !/ללא חני[הי]|אין חני[הי]/.test(text)
    : null;
  const balcony = /מרפסת/.test(text)
    ? !/ללא מרפסת|אין מרפסת/.test(text)
    : null;

  // --- Neighborhood: longest-match against known TLV neighborhoods ---
  let neighborhood = null;
  let best = 0;
  for (const n of KNOWN_NEIGHBORHOODS_LIST) {
    if (n.length > best && text.includes(n)) {
      neighborhood = n;
      best = n.length;
    }
  }

  // --- Street: longest-match against known TLV streets ---
  let street = null;
  let bestS = 0;
  for (const s of KNOWN_STREETS_LIST) {
    if (s.length > bestS && text.includes(s)) {
      street = s;
      bestS = s.length;
    }
  }

  return {
    source: 'facebook',
    price,
    rooms,
    city: 'תל אביב', // assume TLV since the FB groups are TLV-focused
    neighborhood,
    street,
    floor,
    areaSqm,
    phone,
    petsAllowed,
    parking,
    balcony,
    postedAt: null,
  };
}

async function callWithRetry(text, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 1500) },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });
      return response.choices[0]?.message?.content || null;
    } catch (err) {
      if (err.status === 429 && attempt < retries) {
        const waitMatch = err.message.match(/(\d+)m(\d+)/);
        const waitMs = waitMatch
          ? (parseInt(waitMatch[1]) * 60 + parseInt(waitMatch[2])) * 1000
          : 30000;
        const cappedWait = Math.min(waitMs, 60000);
        console.log(`  Rate limited, waiting ${Math.round(cappedWait / 1000)}s...`);
        await new Promise((r) => setTimeout(r, cappedWait));
        continue;
      }
      throw err;
    }
  }
  return null;
}

export async function classifyPost(text) {
  if (!text || text.length < 20) return null;
  if (!mightBeApartment(text)) return null;

  // Heuristic mode — no LLM call. Useful when Groq is rate-limited or down.
  if (process.env.SCRAPE_NO_LLM === 'true') {
    return heuristicClassify(text);
  }

  // NOTE: we deliberately let transient errors (rate limit, network, JSON parse)
  // bubble up so the listener can decide NOT to mark the post as seen and retry
  // it on the next poll.
  const content = await callWithRetry(text);
  if (!content) return null;

  const result = JSON.parse(content);
  if (!result.isApartment) return null;

  return {
    source: 'facebook',
    price: result.price || null,
    rooms: result.rooms || null,
    city: result.city || null,
    neighborhood: result.neighborhood || null,
    street: result.street || null,
    floor: result.floor || null,
    areaSqm: result.areaSqm || null,
    phone: result.phone?.replace(/[\s-]/g, '') || null,
    petsAllowed: result.petsAllowed ?? null,
    parking: result.parking ?? null,
    balcony: result.balcony ?? null,
    postedAt: result.postedAt || null,
  };
}
