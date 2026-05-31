#!/usr/bin/env node
/**
 * scrape-once.js — entry point for GitHub Actions cron.
 *
 * Runs a single full scrape cycle, sends notifications, exits.
 * Exit code 0 = success (even with partial errors)
 * Exit code 1 = catastrophic failure (DB unreachable, missing env, etc.)
 *
 * CLI flags:
 *   --skip-facebook   skip FB groups (useful for debugging Yad2)
 *   --skip-yad2       skip Yad2 (useful for debugging FB)
 */
import dotenv from 'dotenv';
dotenv.config();

import { setupDatabase } from '../db/setup.js';
import { runScan } from '../tasks/scanManager.js';

const args = new Set(process.argv.slice(2));
const opts = {
  skipFacebook: args.has('--skip-facebook'),
  skipYad2: args.has('--skip-yad2'),
};

// --no-llm: heuristic-only mode for FB classification (no Groq calls)
if (args.has('--no-llm') || process.env.SCRAPE_NO_LLM === 'true') {
  process.env.SCRAPE_NO_LLM = 'true';
  console.log('[scrape-once] LLM disabled — using heuristic classifier');
}

async function main() {
  console.log(`[scrape-once] Starting at ${new Date().toISOString()} (opts=${JSON.stringify(opts)})`);

  // Ensure schema is in place — safe to run every time
  await setupDatabase();

  const stats = await runScan(opts);

  console.log(`[scrape-once] Final stats: ${JSON.stringify(stats)}`);
  // Even if individual sources errored, still exit 0 so GHA marks the run green.
  // We only fail the workflow on catastrophic errors (DB unreachable, etc.).
  process.exit(0);
}

main().catch((err) => {
  console.error('[scrape-once] FATAL:', err);
  process.exit(1);
});
