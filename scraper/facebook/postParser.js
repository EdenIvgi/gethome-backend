const APARTMENT_KEYWORDS = ['להשכרה', 'דירה', 'חדרים', 'שכירות', 'מטר', 'קומה'];
// Match price with currency symbol, or standalone 4-5 digit numbers near rent keywords
const PRICE_REGEX = /(\d{1,3}[,.]?\d{3})\s*(?:₪|שקל|ש"ח|שח)|(?:מחיר|שכירות|שכ"ד|שכר\s*דירה|rent)[:\s]*(\d{1,3}[,.]?\d{3})/;
const ROOMS_REGEX = /(\d+(?:\.\d)?)\s*חדר/;
const PHONE_REGEX = /0[5-9]\d[\s-]?\d{3}[\s-]?\d{4}/;
const CITY_KEYWORDS = ['תל אביב', 'ת"א', 'תל-אביב'];
const NEIGHBORHOOD_KEYWORDS = [
  'פלורנטין', 'נווה צדק', 'נווה שאנן', 'שפירא', 'יפו', 'עג\'מי',
  'הצפון הישן', 'הצפון החדש', 'רמת אביב', 'בבלי', 'אפקה',
  'לב העיר', 'מרכז העיר', 'כרם התימנים',
  'יד אליהו', 'מונטיפיורי', 'רמת החייל', 'תל ברוך',
  'כוכב הצפון', 'נווה אביבים',
];

export function isApartmentPost(text) {
  if (!text) return false;
  return APARTMENT_KEYWORDS.some((kw) => text.includes(kw));
}

export function parsePost(text, metadata = {}) {
  if (!text) return null;

  const priceMatch = text.match(PRICE_REGEX);
  const roomsMatch = text.match(ROOMS_REGEX);
  const phoneMatch = text.match(PHONE_REGEX);
  const city = CITY_KEYWORDS.find((c) => text.includes(c)) ? 'תל אביב' : null;
  const neighborhood = NEIGHBORHOOD_KEYWORDS.find((n) => text.includes(n)) || null;

  return {
    source: 'facebook',
    externalId: metadata.postId || null,
    url: metadata.url || null,
    price: priceMatch ? parseInt((priceMatch[1] || priceMatch[2]).replace(/[,.\s]/g, ''), 10) : null,
    rooms: roomsMatch ? parseFloat(roomsMatch[1]) : null,
    areaSqm: null,
    floor: null,
    city,
    neighborhood,
    street: null,
    description: text.slice(0, 1000),
    phone: phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '') : null,
    petsAllowed: /חיות|בע"ח|כלב|חתול/.test(text) ? true : null,
    parking: /חניה|חנייה/.test(text) ? true : null,
    balcony: /מרפסת/.test(text) ? true : null,
    images: metadata.images || [],
    scrapedAt: new Date(),
  };
}
