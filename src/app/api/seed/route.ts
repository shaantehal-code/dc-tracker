import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const db = getDb();
    const existing = (db.prepare('SELECT COUNT(*) as n FROM sites').get() as any).n;
    if (existing > 0) {
      return NextResponse.json({ message: `Database already has ${existing} sites. Use POST to force re-seed.`, sites: existing });
    }
    const result = seedDatabase(db);
    return NextResponse.json({ message: `Seeded ${result.siteCount} sites and ${result.signalCount} signals`, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = getDb();
    db.exec('DELETE FROM signals');
    db.exec('DELETE FROM sites');
    const result = seedDatabase(db);
    return NextResponse.json({ message: `Re-seeded ${result.siteCount} sites and ${result.signalCount} signals`, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
