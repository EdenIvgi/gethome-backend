import './db/setup.js';
import { config } from './config.js';
import express from 'express';
import cors from 'cors';
import listingsRouter from './routes/listings.js';
import scanRouter from './routes/scan.js';
import authRouter from './routes/auth.js';
import preferencesRouter from './routes/preferences.js';
import sseRouter from './routes/sse.js';
import listenersRouter from './routes/listeners.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRequired } from './middleware/auth.js';
import { listenerManager } from './listeners/manager.js';

const app = express();

// CORS
app.use(cors({
  origin: config.clientUrl,
}));

app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/preferences', authRequired, preferencesRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/scan', scanRouter);
app.use('/api/sse', sseRouter);
app.use('/api/listeners', authRequired, listenersRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.use(errorHandler);

// Always load scheduler for cleanup cron jobs
import('./tasks/scheduler.js').then(() => {
  console.log('Scheduler initialized (cleanup cron active)');
});

// Start listeners if scraper is enabled
if (config.enableScraper) {
  listenerManager.startAll().catch((err) => {
    console.error('Failed to start listeners:', err.message);
  });
}

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Scraper: ${config.enableScraper ? 'ENABLED' : 'disabled'}`);
  if (config.facebook.groups.length > 0) {
    console.log(`Facebook groups: ${config.facebook.groups.length}`);
  }
});
