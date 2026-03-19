import cron from 'node-cron';
import { config } from '../config.js';
import { runPipeline } from '../pipeline/index.js';

// Yad2: disabled - run manually with `node backend/scraper/yad2/scraper.js`
// cron.schedule('*/15 * * * *', async () => { ... });

// Facebook: every 30 minutes (only if configured)
cron.schedule('*/30 * * * *', async () => {
  if (config.facebook.groups.length === 0) return;

  console.log(`[${new Date().toISOString()}] Starting Facebook scrape...`);
  try {
    const { getAuthenticatedContext } = await import('../scraper/facebook/auth.js');
    const { scrapeGroups } = await import('../scraper/facebook/groupScraper.js');

    const { browser, context } = await getAuthenticatedContext();
    const listings = await scrapeGroups(context, config.facebook.groups);
    await runPipeline(listings);
    await browser.close();
  } catch (err) {
    console.error('Facebook scheduler error:', err.message);
  }
});

console.log('Scheduler initialized: Facebook (*/30). Yad2 disabled (run manually).');
