import { setupDatabase } from './db/setup.js';
import { config } from './config.js';
import express from 'express';
import cors from 'cors';
import listingsRouter from './routes/listings.js';
import authRouter from './routes/auth.js';
import preferencesRouter from './routes/preferences.js';
import scanRouter from './routes/scan.js';
import listenersRouter from './routes/listeners.js';
import sseRouter from './routes/sse.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRequired } from './middleware/auth.js';

const app = express();

// CORS — locked to the frontend URL if configured, otherwise permissive (dev)
app.use(cors({
  origin: config.clientUrl === '*' ? true : config.clientUrl,
  credentials: true,
}));

app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/preferences', authRequired, preferencesRouter);
app.use('/api/listings', listingsRouter);
// Stub routes (no-op responses) so the legacy SSE/scan/listeners UI components
// don't break when the API is served without live scrapers attached.
app.use('/api/scan', scanRouter);
app.use('/api/listeners', listenersRouter);
app.use('/api/sse', sseRouter);

// Health check — used by Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

// Ensure schema is up to date before accepting traffic.
// In Render this only runs on cold start; in GHA the scrape script does it too.
setupDatabase()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`CORS origin: ${config.clientUrl}`);
    });
  })
  .catch((err) => {
    console.error('Database setup failed, refusing to start:', err);
    process.exit(1);
  });
