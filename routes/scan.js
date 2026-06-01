import { Router } from 'express';

// Stub route — the frontend's ScanButton polls /api/scan/status and POSTs to
// /api/scan. In the GHA-cron architecture scanning happens off-process, so
// these endpoints answer with a static "idle / not available" response so the
// UI renders cleanly instead of looping on 404s.
const router = Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    stats: { added: 0, skipped: 0, errors: 0 },
    error: null,
    note: 'Live scanning is handled by GitHub Actions cron; this endpoint is a UI stub.',
  });
});

router.post('/', (req, res) => {
  res.status(503).json({
    status: 'unavailable',
    message: 'Manual scan is disabled in this deployment. Scrapes run hourly via GitHub Actions.',
  });
});

export default router;
