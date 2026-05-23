import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSiteById, updateSite } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const site = getSiteById(db, params.id);
    if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(site);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const body = await req.json();
    const site = updateSite(db, params.id, body);
    if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(site);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    db.prepare('DELETE FROM sites WHERE id = ?').run(params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
