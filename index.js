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

// CORS — accept:
//   - any subdomain of the configured frontend host (e.g. gethome-frontend.vercel.app
//     plus every preview deploy like gethome-frontend-<hash>-<user>.vercel.app)
//   - http://localhost:5173 for local dev
//   - * if CLIENT_URL=* explicitly opts in to permissive
const ALLOW_LOCAL_DEV = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function vercelHostMatcher(clientUrl) {
  // Derive the root suffix from CLIENT_URL ("gethome-frontend.vercel.app")
  // and accept anything ending with ".vercel.app" — Vercel preview deploys
  // share the apex domain.
  try {
    const u = new URL(clientUrl);
    return u.hostname; // exact match for prod URL
  } catch {
    return null;
  }
}
const exactClientHost = vercelHostMatcher(config.clientUrl);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);                        // curl, server-side
    if (config.clientUrl === '*') return callback(null, true);       // explicit open
    if (ALLOW_LOCAL_DEV.includes(origin)) return callback(null, true);
    try {
      const { hostname, protocol } = new URL(origin);
      if (protocol !== 'https:' && protocol !== 'http:') return callback(new Error('CORS: bad scheme'));
      // Exact production host
      if (exactClientHost && hostname === exactClientHost) return callback(null, true);
      // Any Vercel preview deploy
      if (hostname.endsWith('.vercel.app')) return callback(null, true);
    } catch {}
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
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
