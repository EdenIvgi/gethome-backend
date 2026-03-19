export function parseYad2Listing(item) {
  const images = (item.images_urls || []).slice(0, 3).map((img) =>
    typeof img === 'string' ? img : img.src || ''
  );

  return {
    source: 'yad2',
    externalId: String(item.id),
    url: `https://www.yad2.co.il/item/${item.id}`,
    price: parseInt(String(item.price || '').replace(/[^\d]/g, ''), 10) || null,
    rooms: item.Rooms_text ? parseFloat(item.Rooms_text) : null,
    areaSqm: item.square_meters ? parseInt(item.square_meters, 10) : null,
    floor: item.floor != null ? parseInt(item.floor, 10) : null,
    city: item.city || null,
    neighborhood: item.neighborhood || null,
    street: item.street || null,
    description: item.info_text || item.title || null,
    phone: item.contact_phone || null,
    petsAllowed: null, // Yad2 API doesn't expose this
    parking: item.parking != null ? Boolean(item.parking) : null,
    balcony: item.balcony != null ? Boolean(item.balcony) : null,
    images,
    scrapedAt: new Date(),
  };
}
