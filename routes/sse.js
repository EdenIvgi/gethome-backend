import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { addClient } from '../notifications/sseManager.js';

const router = Router();

// SSE endpoint - EventSource doesn't support headers, so JWT via query param
router.get('/listings', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  let user;
  try {
    user = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', userId: user.id })}\n\n`);

  // Register this client
  addClient(user.id, res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

export default router;
