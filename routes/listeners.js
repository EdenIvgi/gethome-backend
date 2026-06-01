import { Router } from 'express';

// Stub route — the frontend's ListenerStatus component polls
// /api/listeners/status. There are no live listeners in the GHA architecture,
// so we return a fixed "not running" payload.
const router = Router();

router.get('/status', (req, res) => {
  res.json({
    facebook: { running: false, workerCount: 0, busyWorkers: 0, groups: [] },
    yad2: { running: false, pollCount: 0, seenListings: 0 },
    sseClients: 0,
    note: 'Listeners are disabled — scrapes run hourly via GitHub Actions.',
  });
});

export default router;
