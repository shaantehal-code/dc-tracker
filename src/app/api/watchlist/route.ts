import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSiteById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const { siteId } = await req.json();
    const site = getSiteById(db, siteId) as any;
    if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const newVal = site.watchlisted ? 0 : 1;
    db.prepare('UPDATE sites SET watchlisted = ?, last_updated = datetime(\'now\') WHERE id = ?').run(newVal, siteId);
    return NextResponse.json({ watchlisted: newVal === 1 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
