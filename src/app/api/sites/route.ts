import { NextRequest, NextResponse } from 'next/server';
import { getDb, getAllSites } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const db = getDb();
    const sites = getAllSites(db);
    return NextResponse.json(sites);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const id = body.id || `site-${Date.now()}`;
    db.prepare(`
      INSERT INTO sites (id, name, lat, lng, type, status, power_capacity_mw, power_available_mw,
        land_acres, fiber_access, water_access, opportunity_score, region, country, state, city,
        power_cost_per_mwh, pue_estimate, asking_price_musd, notes, tags, user_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, body.name, body.lat, body.lng,
      body.type || 'greenfield', body.status || 'available',
      body.powerCapacityMW || 0, body.powerAvailableMW || 0,
      body.landAcres || 0, body.fiberAccess || 'none', body.waterAccess || 'none',
      body.opportunityScore || 50, body.region, body.country, body.state, body.city,
      body.powerCostPerMWh || 60, body.pueEstimate || 1.4, body.askingPriceMUSD || null,
      body.notes || '', JSON.stringify(body.tags || []), body.userNotes || ''
    );
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    return NextResponse.json(site, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
