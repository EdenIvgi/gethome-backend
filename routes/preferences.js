import { Router } from 'express';
import { upsertPreference, getUserPreferences, deletePreference, updateUserTelegram, getUserNotifications } from '../db/queries.js';

const router = Router();

// Get current user's preferences
router.get('/', (req, res, next) => {
  try {
    const prefs = getUserPreferences(req.user.id);
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

// Create or update a preference
router.put('/', (req, res, next) => {
  try {
    upsertPreference(req.user.id, req.body);
    const prefs = getUserPreferences(req.user.id);
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

// Delete a preference by source
router.delete('/:source', (req, res, next) => {
  try {
    deletePreference(req.user.id, req.params.source);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Get user's matched apartment notifications (notification inbox)
router.get('/notifications', (req, res, next) => {
  try {
    const notifications = getUserNotifications(req.user.id);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

// Link Telegram chat ID
router.put('/telegram', (req, res, next) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    updateUserTelegram(req.user.id, chatId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
