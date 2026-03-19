import { Router } from 'express';
import { getListings, getListingById, getMapListings } from '../db/queries.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { city, area, minPrice, maxPrice, rooms, pets, page, limit } = req.query;
    const result = getListings({ city, area, minPrice, maxPrice, rooms, pets, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/map/all', (req, res, next) => {
  try {
    const markers = getMapListings();
    res.json(markers);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const listing = getListingById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    next(err);
  }
});

export default router;
