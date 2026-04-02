import db from './pool.js';

const testListings = [
  {
    fingerprint: 'test-1',
    source: 'test',
    externalId: 'test-1',
    url: 'https://example.com/1',
    price: 3500,
    rooms: 2,
    areaSqm: 70,
    floor: 2,
    city: 'תל אביב',
    neighborhood: 'לב העיר',
    street: 'דיזינגוף',
    area: 'מרכז תל אביב',
    lat: 32.0853,
    lng: 34.7818,
    petsAllowed: 1,
    parking: 1,
    balcony: 1,
    elevator: 1,
    furnished: 0,
    phone: '050-1234567',
    description: 'דירה נהדרת במרכז העיר, קרובה לתחבורה ציבורית',
    images: JSON.stringify(['https://via.placeholder.com/400x300?text=Apt1']),
    postedAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    textHash: 'hash-test-1',
  },
  {
    fingerprint: 'test-2',
    source: 'test',
    externalId: 'test-2',
    url: 'https://example.com/2',
    price: 4200,
    rooms: 3,
    areaSqm: 95,
    floor: 4,
    city: 'תל אביב',
    neighborhood: 'הצפון החדש',
    street: 'רחוב אחד',
    area: 'צפון תל אביב',
    lat: 32.1148,
    lng: 34.7878,
    petsAllowed: 0,
    parking: 1,
    balcony: 1,
    elevator: 1,
    furnished: 1,
    phone: '050-2345678',
    description: 'דירה גדולה ומרוהטת בצפון העיר, בנויה על 95 מ"ר',
    images: JSON.stringify(['https://via.placeholder.com/400x300?text=Apt2']),
    postedAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    textHash: 'hash-test-2',
  },
  {
    fingerprint: 'test-3',
    source: 'test',
    externalId: 'test-3',
    url: 'https://example.com/3',
    price: 2800,
    rooms: 1,
    areaSqm: 45,
    floor: 1,
    city: 'תל אביב',
    neighborhood: 'פלורנטין',
    street: 'רחוב דרום',
    area: 'דרום תל אביב',
    lat: 32.0586,
    lng: 34.7708,
    petsAllowed: 1,
    parking: 0,
    balcony: 0,
    elevator: 0,
    furnished: 0,
    phone: '050-3456789',
    description: 'סטודיו קטן וחמוד בפלורנטין',
    images: JSON.stringify(['https://via.placeholder.com/400x300?text=Apt3']),
    postedAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    textHash: 'hash-test-3',
  },
];

try {
  const insertStmt = db.prepare(`
    INSERT INTO listings (
      fingerprint, source, external_id, url, price, rooms, area_sqm, floor,
      city, neighborhood, street, area, lat, lng, pets_allowed, parking, balcony,
      elevator, furnished,
      phone, description, images, posted_at, scraped_at, last_seen_at, text_hash
    ) VALUES (
      @fingerprint, @source, @externalId, @url, @price, @rooms, @areaSqm, @floor,
      @city, @neighborhood, @street, @area, @lat, @lng, @petsAllowed, @parking, @balcony,
      @elevator, @furnished,
      @phone, @description, @images, @postedAt, @scrapedAt, @lastSeenAt, @textHash
    )
  `);

  for (const listing of testListings) {
    insertStmt.run(listing);
  }

  console.log(`✓ Seeded ${testListings.length} test listings`);
} catch (err) {
  console.error('Failed to seed database:', err.message);
  process.exit(1);
}
