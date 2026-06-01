import { Router } from 'express';

// Stub route — the frontend's useSSE hook opens an EventSource to
// /api/sse/listings expecting realtime new-listing pushes. We don't push
// anything in the GHA-cron architecture (new data appears at hourly cadence),
// but we keep the SSE connection alive with heartbeats so the hook doesn't
// loop on reconnect errors and stall the UI.
const router = Router();

router.get('/listings', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', mode: 'cron' })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => clearInterval(heartbeat));
});

export default router;
