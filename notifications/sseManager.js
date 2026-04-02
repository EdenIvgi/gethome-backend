// SSE client management: tracks connected clients per user
const clients = new Map(); // userId -> Set<Response>

export function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);

  // Clean up on disconnect
  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) clients.delete(userId);
    }
  });
}

export function pushToUser(userId, listing) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;

  const data = JSON.stringify({
    type: 'new-listing',
    listing: {
      id: listing.id,
      source: listing.source,
      price: listing.price,
      rooms: listing.rooms,
      area: listing.area,
      neighborhood: listing.neighborhood,
      city: listing.city,
      url: listing.url,
      images: listing.images,
    },
  });

  for (const res of userClients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      userClients.delete(res);
    }
  }
}

export function getConnectedCount() {
  let total = 0;
  for (const [, set] of clients) total += set.size;
  return total;
}
