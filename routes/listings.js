import { Router } from 'express';
import { getListings, getListingById, getMapListings } from '../db/queries.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { city, area, minPrice, maxPrice, minRooms, maxRooms, rooms, pets, parking, balcony, elevator, furnished, minFloor, maxFloor, minSizeSqm, maxSizeSqm, postedWithin, page, limit } = req.query;
    const result = await getListings({ city, area, minPrice, maxPrice, minRooms, maxRooms, rooms, pets, parking, balcony, elevator, furnished, minFloor, maxFloor, minSizeSqm, maxSizeSqm, postedWithin, page, limit });
    // Short cache absorbs duplicate/rapid refetches (grid + map + back/forward).
    res.set('Cache-Control', 'private, max-age=15');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/map/all', async (req, res, next) => {
  try {
    let bbox;
    if (req.query.bbox) {
      const parts = String(req.query.bbox).split(',').map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) bbox = parts;
    }
    const markers = await getMapListings({ bbox, limit: req.query.limit });
    res.set('Cache-Control', 'private, max-age=15');
    res.json(markers);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const listing = await getListingById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    next(err);
  }
});

export default router;
