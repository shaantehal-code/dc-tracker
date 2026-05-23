import { NextRequest, NextResponse } from 'next/server';
import { getDb, addSignal } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const db = getDb();
    const signals = db.prepare(`
      SELECT s.*, si.name as site_name
      FROM signals s JOIN sites si ON s.site_id = si.id
      ORDER BY s.date DESC, s.created_at DESC LIMIT 100
    `).all();
    return NextResponse.json(signals);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const result = addSignal(db, body);
    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
