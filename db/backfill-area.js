import db from './pool.js';
import { config } from '../config.js';

const map = {};
for (const [area, neighborhoods] of Object.entries(config.telAvivAreas)) {
  for (const n of neighborhoods) map[n] = area;
}

const rows = db.prepare('SELECT id, neighborhood FROM listings WHERE neighborhood IS NOT NULL AND area IS NULL').all();
let updated = 0;
const stmt = db.prepare('UPDATE listings SET area = ? WHERE id = ?');

for (const row of rows) {
  const trimmed = row.neighborhood.trim();
  let area = map[trimmed];
  if (!area) {
    for (const [n, a] of Object.entries(map)) {
      if (trimmed.includes(n) || n.includes(trimmed)) { area = a; break; }
    }
  }
  if (area) {
    stmt.run(area, row.id);
    updated++;
  }
}

console.log(`Backfilled ${updated} of ${rows.length} listings`);
