/**
 * Background ingestion scheduler.
 * Runs all data sources every 6 hours using node-cron.
 * Auto-seeds the database on first boot if empty.
 */
import cron from 'node-cron';
import { getDb } from './db';
import { seedDatabase } from './seed';
import { runAllSources } from './ingestion/runner';

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Auto-seed on boot if DB is empty
  try {
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as n FROM sites').get() as { n: number }).n;
    if (count === 0) {
      console.log('[Scheduler] DB empty — auto-seeding...');
      const r = seedDatabase(db);
      console.log(`[Scheduler] Seeded ${r.siteCount} sites, ${r.signalCount} signals`);
    }
  } catch (e) {
    console.error('[Scheduler] Auto-seed error:', e);
  }

  // Run all sources every 6 hours: at :00 of hours 0, 6, 12, 18
  cron.schedule('0 0,6,12,18 * * *', async () => {
    console.log('[Scheduler] Starting scheduled ingestion...');
    try {
      const db = getDb();
      const results = await runAllSources(db);
      const total = results.reduce((n, r) => n + r.signalsNew, 0);
      const summary = results.map(r => `${r.label}: ${r.signalsNew} new`).join(', ');
      console.log(`[Scheduler] Ingestion complete — ${total} new signals | ${summary}`);
    } catch (e) {
      console.error('[Scheduler] Ingestion error:', e);
    }
  });

  console.log('[Scheduler] Auto-ingestion scheduled every 6 hours (0:00, 6:00, 12:00, 18:00 UTC)');
}
