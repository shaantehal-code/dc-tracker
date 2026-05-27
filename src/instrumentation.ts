/**
 * Next.js instrumentation hook — runs once on server startup.
 * Wires up the background ingestion scheduler (every 6 hours).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
