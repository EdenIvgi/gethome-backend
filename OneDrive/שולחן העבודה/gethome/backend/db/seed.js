import dotenv from 'dotenv';
dotenv.config();

import { runPipeline } from '../pipeline/index.js';
import pool from './pool.js';

const sampleListings = [
  {
    source: 'yad2', externalId: 'y001', url: 'https://www.yad2.co.il/item/y001',
    price: 5500, rooms: 3, areaSqm: 75, floor: 3,
    city: 'תל אביב', neighborhood: 'פלורנטין', street: 'רחוב פלורנטין 22',
    petsAllowed: true, parking: false, balcony: true,
    phone: '0501234567', description: 'דירת 3 חדרים בפלורנטין, משופצת, קומה 3 עם מרפסת',
  },
  {
    source: 'yad2', externalId: 'y002', url: 'https://www.yad2.co.il/item/y002',
    price: 4200, rooms: 2.5, areaSqm: 55, floor: 1,
    city: 'תל אביב', neighborhood: 'יפו', street: 'רחוב ירושלים 15',
    petsAllowed: false, parking: true, balcony: false,
    phone: '0521234567', description: 'דירת 2.5 חדרים ביפו, חניה כלולה',
  },
  {
    source: 'facebook', externalId: 'f001', url: 'https://facebook.com/groups/apartments.tlv/posts/f001',
    price: 7800, rooms: 4, areaSqm: 95, floor: 5,
    city: 'תל אביב', neighborhood: 'הצפון הישן', street: 'רחוב דיזנגוף 180',
    petsAllowed: true, parking: true, balcony: true,
    phone: '0541234567', description: 'דירת 4 חדרים בדיזנגוף, גג עם נוף לים',
  },
  {
    source: 'yad2', externalId: 'y003', url: 'https://www.yad2.co.il/item/y003',
    price: 3800, rooms: 2, areaSqm: 48, floor: 2,
    city: 'ירושלים', neighborhood: 'נחלאות', street: 'רחוב יפו 100',
    petsAllowed: false, parking: false, balcony: true,
    phone: '0531234567', description: 'דירת 2 חדרים בנחלאות, אווירה ייחודית',
  },
  {
    source: 'facebook', externalId: 'f002', url: 'https://facebook.com/groups/apartments.jlm/posts/f002',
    price: 4500, rooms: 3, areaSqm: 70, floor: 4,
    city: 'ירושלים', neighborhood: 'בקעה', street: 'רחוב בצלאל 30',
    petsAllowed: true, parking: false, balcony: false,
    phone: '0551234567', description: 'דירת 3 חדרים בבקעה, ליד שוק מחנה יהודה',
  },
  {
    source: 'yad2', externalId: 'y004', url: 'https://www.yad2.co.il/item/y004',
    price: 3200, rooms: 2, areaSqm: 52, floor: 1,
    city: 'חיפה', neighborhood: 'הדר', street: 'רחוב הרצל 50',
    petsAllowed: true, parking: true, balcony: true,
    phone: '0501111111', description: 'דירת 2 חדרים בהדר, מרוהטת חלקית',
  },
  {
    source: 'yad2', externalId: 'y005', url: 'https://www.yad2.co.il/item/y005',
    price: 6200, rooms: 3.5, areaSqm: 85, floor: 7,
    city: 'רמת גן', neighborhood: 'הגפן', street: 'רחוב ביאליק 12',
    petsAllowed: false, parking: true, balcony: true,
    phone: '0502222222', description: 'דירת 3.5 חדרים ברמת גן, קומה גבוהה עם נוף',
  },
  {
    source: 'facebook', externalId: 'f003', url: 'https://facebook.com/groups/apartments.tlv/posts/f003',
    price: 4800, rooms: 2, areaSqm: 60, floor: 3,
    city: 'גבעתיים', neighborhood: 'בורוכוב', street: 'רחוב בורוכוב 45',
    petsAllowed: true, parking: false, balcony: true,
    phone: '0503333333', description: 'דירת 2 חדרים בגבעתיים, שקטה ומוארת',
  },
  {
    source: 'yad2', externalId: 'y006', url: 'https://www.yad2.co.il/item/y006',
    price: 5000, rooms: 3, areaSqm: 72, floor: 2,
    city: 'הרצליה', neighborhood: 'הרצליה ב', street: 'רחוב סוקולוב 88',
    petsAllowed: false, parking: true, balcony: false,
    phone: '0504444444', description: 'דירת 3 חדרים בהרצליה, קרובה לים',
  },
  {
    source: 'yad2', externalId: 'y007', url: 'https://www.yad2.co.il/item/y007',
    price: 2800, rooms: 1.5, areaSqm: 35, floor: 1,
    city: 'באר שבע', neighborhood: 'העיר העתיקה', street: 'רחוב העצמאות 20',
    petsAllowed: true, parking: false, balcony: false,
    phone: '0505555555', description: 'סטודיו גדול בבאר שבע, מושלם לסטודנטים',
  },
];

async function seed() {
  console.log('Seeding database with sample listings...');
  const stats = await runPipeline(sampleListings);
  console.log('Seed complete:', stats);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
