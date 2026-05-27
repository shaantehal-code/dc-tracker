import { NextRequest, NextResponse } from 'next/server';
import { getDb, addSignal } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId');
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Math.min(Math.max(limitParam, 1), 2000);
    const since = searchParams.get('since'); // e.g. '7d', '30d', '90d'
    const sinceDate = since ? (() => {
      const days = parseInt(since, 10);
      if (isNaN(days)) return null;
      const d = new Date(); d.setDate(d.getDate() - days);
      return d.toISOString().slice(0, 10);
    })() : null;

    let signals: unknown[];
    if (siteId && sinceDate) {
      signals = db.prepare(`SELECT s.*, si.name as site_name FROM signals s JOIN sites si ON s.site_id = si.id WHERE s.site_id = ? AND s.date >= ? ORDER BY s.date DESC, s.created_at DESC LIMIT ?`).all(siteId, sinceDate, limit);
    } else if (siteId) {
      signals = db.prepare(`SELECT s.*, si.name as site_name FROM signals s JOIN sites si ON s.site_id = si.id WHERE s.site_id = ? ORDER BY s.date DESC, s.created_at DESC LIMIT ?`).all(siteId, limit);
    } else if (sinceDate) {
      signals = db.prepare(`SELECT s.*, si.name as site_name FROM signals s JOIN sites si ON s.site_id = si.id WHERE s.date >= ? ORDER BY s.date DESC, s.created_at DESC LIMIT ?`).all(sinceDate, limit);
    } else {
      signals = db.prepare(`SELECT s.*, si.name as site_name FROM signals s JOIN sites si ON s.site_id = si.id ORDER BY s.date DESC, s.created_at DESC LIMIT ?`).all(limit);
    }
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
