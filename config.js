import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || '*',
  enableScraper: process.env.ENABLE_SCRAPER === 'true',
  databaseUrl: process.env.DATABASE_URL,

  facebook: {
    email: process.env.FB_EMAIL || '',
    password: process.env.FB_PASSWORD || '',
    // Facebook groups for apartment rentals in Israel
    // You MUST join these groups manually with your FB account first
    // Private groups require approval - join and wait before scraping
    groups: (process.env.FB_GROUPS || '').split(',').filter(Boolean),
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  jwtSecret: process.env.JWT_SECRET || 'gethome-dev-secret-change-in-production',

  yad2: {
    cityId: 5000, // Tel Aviv
    maxPages: parseInt(process.env.YAD2_MAX_PAGES || '2', 10),
  },

  listeners: {
    fbPollIntervalMs: parseInt(process.env.FB_POLL_INTERVAL || '45000', 10),
    fbRefreshIntervalMs: parseInt(process.env.FB_REFRESH_INTERVAL || '720000', 10),
    fbWorkerCount: parseInt(process.env.FB_WORKER_COUNT || '4', 10),
    yad2PollIntervalMs: parseInt(process.env.YAD2_POLL_INTERVAL || '420000', 10),
    peakStartHour: 8,
    peakEndHour: 23,
    quietMultiplier: 3,
  },

  cleanup: {
    staleMaxHours: parseInt(process.env.CLEANUP_STALE_HOURS || '48', 10),
    intervalCron: process.env.CLEANUP_CRON || '0 */6 * * *',
  },

  // Tel Aviv area definitions - map neighborhood names from Yad2 to areas
  telAvivAreas: {
    'צפון תל אביב': ['הצפון הישן', 'הצפון החדש', 'כוכב הצפון', 'רמת אביב', 'נווה אביבים', 'צפון תל אביב', 'בבלי', 'אפקה'],
    'מרכז תל אביב': ['לב העיר', 'מרכז העיר', 'לב תל אביב', 'מרכז תל אביב', 'כרם התימנים', 'לילינבלום'],
    'דרום תל אביב': ['פלורנטין', 'נווה שאנן', 'שפירא', 'נווה צדק', 'דרום תל אביב'],
    'יפו': ['יפו', 'עג\'מי', 'יפו ד', 'יפו העתיקה', 'נמל יפו'],
    'מזרח תל אביב': ['יד אליהו', 'הארגזים', 'מונטיפיורי', 'שכונת התקווה', 'מזרח תל אביב'],
    'רמת החייל': ['רמת החייל', 'תל ברוך', 'תל ברוך צפון'],
  },
};

// Suggested Facebook groups for Israeli apartment rentals:
// PUBLIC groups (easier to join):
//   https://www.facebook.com/groups/apartments.tlv
//   https://www.facebook.com/groups/dira.behol.mechiir
//   https://www.facebook.com/groups/sublet.tlv
//   https://www.facebook.com/groups/dirot.israel
//   https://www.facebook.com/groups/ApartmentsInTelAviv
//
// PRIVATE groups (require join request + approval):
//   https://www.facebook.com/groups/SecretTelAviv
//   https://www.facebook.com/groups/tlv.apartments
//
// HOW TO SET UP:
// 1. Create a dedicated Facebook account (don't use your personal one!)
// 2. Join the groups above manually via browser
// 3. Wait for approval on private groups
// 4. Run: npm run login-fb  (opens browser for manual login)
// 5. Set FB_GROUPS in .env:
//    FB_GROUPS=https://www.facebook.com/groups/apartments.tlv,https://www.facebook.com/groups/dira.behol.mechiir
// 6. Set ENABLE_SCRAPER=true
