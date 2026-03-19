import { createHash } from 'crypto';

export function createFingerprint(listing) {
  const raw = [
    listing.price || '',
    listing.rooms || '',
    listing.city || '',
    listing.neighborhood || '',
    listing.areaSqm || '',
  ].join('|');

  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
