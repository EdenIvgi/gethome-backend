import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || '*',

  facebook: {
    email: process.env.FB_EMAIL || '',
    password: process.env.FB_PASSWORD || '',
    // Comma-separated group URLs (env). You MUST join them manually with the
    // configured FB account first. Private groups require approval.
    groups: (process.env.FB_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  jwtSecret: process.env.JWT_SECRET || 'gethome-dev-secret-change-in-production',

  yad2: {
    cityId: 5000, // Tel Aviv
    maxPages: parseInt(process.env.YAD2_MAX_PAGES || '2', 10),
    // How many new listings get detail-page enrichment per scrape, and how
    // many detail pages to fetch in parallel. Keep concurrency ≤ 3 to dodge
    // Yad2 anti-bot / hCaptcha.
    detailLimit: parseInt(process.env.YAD2_DETAIL_LIMIT || '8', 10),
    detailConcurrency: Math.min(3, parseInt(process.env.YAD2_DETAIL_CONCURRENCY || '2', 10)),
  },

  // Tunables used by the scrape-once pipeline + classifier. Most of the old
  // "listeners" knobs are obsolete in the GHA-cron architecture.
  scrape: {
    fbClassifyConcurrency: parseInt(process.env.FB_CLASSIFY_CONCURRENCY || '5', 10),
    // How many days back to read FB feed by post publish date.
    fbLookbackDays: parseInt(process.env.FB_LOOKBACK_DAYS || '7', 10),
    fbMaxScrolls: parseInt(process.env.FB_MAX_SCROLLS || '25', 10),
    // Stop scrolling once this many consecutive posts are older than lookback.
    fbOldStreakStop: parseInt(process.env.FB_OLD_STREAK_STOP || '6', 10),
  },

  serving: {
    // /api/listings COUNT(*) cache TTL, and map endpoint marker cap.
    listingsCountTtlMs: parseInt(process.env.LISTINGS_COUNT_TTL_MS || '30000', 10),
    mapMaxMarkers: parseInt(process.env.MAP_MAX_MARKERS || '2000', 10),
  },

  cleanup: {
    // Listings not re-seen within this window are HARD-DELETED (7 days).
    // last_seen_at is bumped on every reappearance, so anything past the
    // window is genuinely gone from the source and is removed for good.
    staleMaxHours: parseInt(process.env.CLEANUP_STALE_HOURS || '168', 10),
  },

  // Tel Aviv area definitions — neighborhood → broad area.
  // Used by resolveArea() with word-boundary phrase matching.
  telAvivAreas: {
    'צפון תל אביב': [
      'הצפון הישן', 'הצפון החדש', 'כוכב הצפון', 'רמת אביב', 'רמת אביב ג', 'רמת אביב החדשה',
      'נווה אביבים', 'נאות אפקה', 'אפקה', 'מעוז אביב', 'הדר יוסף', 'רביבים', 'בבלי',
      'כיכר המדינה', 'אזורי חן', 'צמרת', 'צמרות', 'מתחם שדה דב', 'צפון תל אביב', 'צפון העיר',
    ],
    'מרכז תל אביב': [
      'לב העיר', 'לב תל אביב', 'מרכז העיר', 'מרכז תל אביב', 'כרם התימנים', 'הכרם',
      'נחלת בנימין', 'לילינבלום', 'גן החשמל', 'הצריף', 'מתחם רוטשילד', 'רחביה',
      'מונטיפיורי', 'שדרות רוטשילד', 'רוטשילד', 'ככר רבין', 'כיכר רבין',
    ],
    'דרום תל אביב': [
      'פלורנטין', 'נווה שאנן', 'שפירא', 'נווה צדק', 'קריית שלום', 'קרית שלום',
      'נווה עופר', 'תל כביר', 'עזרא', 'אבו כביר', 'דרום תל אביב', 'דרום העיר',
    ],
    'יפו': [
      'יפו', 'יפו העתיקה', 'יפו ד', 'עג\'מי', 'עג׳מי', 'צהלון', 'גבעת העלייה',
      'גבעת התמרים', 'נווה גולן', 'דקר', 'נמל יפו', 'יפו ג',
    ],
    'מזרח תל אביב': [
      'יד אליהו', 'ביצרון', 'רמת ישראל', 'שכונת התקווה', 'התקווה', 'הארגזים',
      'נחלת יצחק', 'קריית המלאכה', 'קרית המלאכה', 'המשתלה', 'עלייה', 'מזרח תל אביב',
    ],
    'רמת החייל': ['רמת החייל', 'תל ברוך', 'תל ברוך צפון', 'מתחם הביטחון'],
  },

  // Major streets → area. A KNOWN street is high-confidence ground truth and
  // overrides an LLM-guessed neighborhood (see resolveArea). Therefore only
  // list streets that sit firmly within ONE area — no long cross-area
  // arterials (Ibn Gabirol, Namir, Arlozorov, Herzl…).
  telAvivStreets: {
    'מרכז תל אביב': [
      'רוטשילד', 'דיזנגוף', 'בן יהודה', 'שינקין', 'בוגרשוב', 'פרישמן',
      'גורדון', 'קינג גורג', 'המלך גורג', 'בר כוכבא', 'ז\'בוטינסקי',
      'ז׳בוטינסקי', 'שדרות בן גוריון', 'בן גוריון', 'מזא"ה', 'מזא״ה', 'טרומפלדור',
    ],
    'צפון תל אביב': [
      'אינשטיין', 'ברודצקי', 'חיים לבנון', 'פנקס', 'יהודה המכבי',
      'ויצמן', 'דב הוז',
    ],
    'דרום תל אביב': [
      'פרנקל', 'וושינגטון', 'ושינגטון', 'הרצל', 'לוינסקי', 'מטלון',
      'אילת', 'סלמה', 'שלמה', 'אברבנאל', 'ויטל', 'הקישון', 'יסוד המעלה',
      'הר ציון', 'נווה שאנן', 'פינס', 'מסילת ישרים', 'החלוצים', 'וולפסון',
    ],
    'יפו': ['יפת', 'שדרות ירושלים', 'דוד רזיאל', 'קדם', 'יהודה הימית', 'נס לגויים'],
  },

  // Aliases / transliterations → canonical Hebrew neighborhood name.
  neighborhoodAliases: {
    'florentin': 'פלורנטין', 'florentine': 'פלורנטין',
    'neve tzedek': 'נווה צדק', 'neve zedek': 'נווה צדק',
    'kerem hateimanim': 'כרם התימנים', 'kerem': 'כרם התימנים',
    'yafo': 'יפו', 'jaffa': 'יפו', 'ajami': 'עג\'מי',
    'ramat aviv': 'רמת אביב', 'old north': 'הצפון הישן', 'new north': 'הצפון החדש',
    'city center': 'מרכז העיר', 'lev hair': 'לב העיר',
    'rothschild': 'רוטשילד', 'dizengoff': 'דיזנגוף', 'shenkin': 'שינקין',
    'sheinkin': 'שינקין', 'ben yehuda': 'בן יהודה', 'allenby': 'אלנבי',
    'kikar hamedina': 'כיכר המדינה', 'hatikva': 'התקווה', 'shapira': 'שפירא',
  },
};
