import { Router } from 'express';
import { upsertPreference, getUserPreferences, deletePreference, updateUserTelegram, getUserNotifications } from '../db/queries.js';

const router = Router();

// Get current user's preferences
router.get('/', async (req, res, next) => {
  try {
    const prefs = await getUserPreferences(req.user.id);
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

// Create or update a preference
router.put('/', async (req, res, next) => {
  try {
    await upsertPreference(req.user.id, req.body);
    const prefs = await getUserPreferences(req.user.id);
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

// Delete a preference by source
router.delete('/:source', async (req, res, next) => {
  try {
    await deletePreference(req.user.id, req.params.source);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Get user's matched apartment notifications (notification inbox)
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await getUserNotifications(req.user.id);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

// Link Telegram chat ID
router.put('/telegram', async (req, res, next) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    await updateUserTelegram(req.user.id, chatId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
