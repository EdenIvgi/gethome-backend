import axios from 'axios';

const cache = new Map();
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocode(city, street) {
  const query = [street, city, 'ישראל'].filter(Boolean).join(', ');
  if (!query || query === 'ישראל') return { lat: null, lng: null };

  if (cache.has(query)) return cache.get(query);

  try {
    await delay(1100); // Nominatim: max 1 req/sec

    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q: query,
        format: 'json',
        limit: 1,
        countrycodes: 'il',
      },
      headers: { 'User-Agent': 'GetHome/1.0' },
    });

    const result = data[0]
      ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      : { lat: null, lng: null };

    cache.set(query, result);
    return result;
  } catch (err) {
    console.error('Geocode error:', query, err.message);
    return { lat: null, lng: null };
  }
}
