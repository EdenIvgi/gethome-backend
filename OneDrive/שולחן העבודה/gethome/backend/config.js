import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
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

  yad2: {
    cityId: 5000, // Tel Aviv
    maxPages: parseInt(process.env.YAD2_MAX_PAGES || '2', 10),
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
