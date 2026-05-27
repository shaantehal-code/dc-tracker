import { NextRequest, NextResponse } from 'next/server';
import { getDb, getAllSites, getIngestionLog } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

export const dynamic = 'force-dynamic';

// In-memory command log (process lifetime)
const commandLog: { ts: string; command: string; params: Record<string, unknown>; result: unknown }[] = [];

export function GET() {
  try {
    const db = getDb();
    const siteCount = (db.prepare('SELECT COUNT(*) as n FROM sites').get() as any).n;
    const signalCount = (db.prepare('SELECT COUNT(*) as n FROM signals').get() as any).n;
    const ingestLog = getIngestionLog(db, 5);
    return NextResponse.json({ siteCount, signalCount, ingestLog, commandLog: [...commandLog].reverse().slice(0, 20) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { command, params = {}, ...rest } = body as { command: string; params: Record<string, unknown>; [k: string]: unknown };
    const allParams = { ...params, ...rest };

    let result: unknown;

    switch (command) {
      case 'status': {
        const siteCount = (db.prepare('SELECT COUNT(*) as n FROM sites').get() as any).n;
        const signalCount = (db.prepare('SELECT COUNT(*) as n FROM signals').get() as any).n;
        const lastIngest = db.prepare('SELECT * FROM ingestion_log ORDER BY started_at DESC LIMIT 1').get() ?? null;
        result = { siteCount, signalCount, lastIngest };
        break;
      }

      case 'seed': {
        const force = allParams.force === true;
        const existing = (db.prepare('SELECT COUNT(*) as n FROM sites').get() as any).n;
        if (existing > 0 && !force) {
          result = { message: `DB already has ${existing} sites. Pass "force":true to re-seed.`, siteCount: existing, skipped: true };
        } else {
          db.exec('DELETE FROM signals');
          db.exec('DELETE FROM sites');
          const r = seedDatabase(db);
          result = { message: `Seeded ${r.siteCount} sites and ${r.signalCount} signals`, ...r };
        }
        break;
      }

      case 'export': {
        const sites = getAllSites(db);
        result = { sites, exportedAt: new Date().toISOString(), count: sites.length };
        break;
      }

      case 'clear_signals': {
        const before = (db.prepare('SELECT COUNT(*) as n FROM signals').get() as any).n;
        db.exec('DELETE FROM signals');
        result = { message: `Cleared ${before} signal${before !== 1 ? 's' : ''}` };
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown command: "${command}". Valid: status, seed, export, clear_signals` }, { status: 400 });
    }

    const entry = { ts: new Date().toISOString(), command, params, result };
    commandLog.push(entry);
    if (commandLog.length > 100) commandLog.shift();

    return NextResponse.json({ ok: true, command, result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
