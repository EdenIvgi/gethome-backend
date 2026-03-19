import { config } from './config.js';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import listingsRouter from './routes/listings.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// CORS
app.use(cors({
  origin: config.clientUrl,
}));

app.use(express.json());

// API routes
app.use('/api/listings', listingsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (config.nodeEnv === 'production') {
  const clientDist = join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

// Start scheduler if enabled
if (config.enableScraper) {
  import('./tasks/scheduler.js').then(() => {
    console.log('Scraper scheduler started');
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
