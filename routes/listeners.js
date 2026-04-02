import { Router } from 'express';
import { listenerManager } from '../listeners/manager.js';
import { getConnectedCount } from '../notifications/sseManager.js';

const router = Router();

router.get('/status', (req, res) => {
  const status = listenerManager.getStatus();
  status.sseClients = getConnectedCount();
  res.json(status);
});

router.post('/start', async (req, res, next) => {
  try {
    const { source } = req.body || {};
    if (source === 'facebook') await listenerManager.startFacebook();
    else if (source === 'yad2') await listenerManager.startYad2();
    else await listenerManager.startAll();
    res.json({ ok: true, status: listenerManager.getStatus() });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', async (req, res, next) => {
  try {
    const { source } = req.body || {};
    if (source === 'facebook') await listenerManager.stopFacebook();
    else if (source === 'yad2') await listenerManager.stopYad2();
    else await listenerManager.stopAll();
    res.json({ ok: true, status: listenerManager.getStatus() });
  } catch (err) {
    next(err);
  }
});

export default router;
