import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EIA_BASE = 'https://api.eia.gov/v2';

interface EiaPrice {
  period: string;          // YYYY-MM
  stateid: string;
  stateDescription: string;
  price: number;           // cents per kWh
}

// US states + DC. Excludes regional/national aggregates (US, regions, etc.)
const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]);

export async function GET() {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'EIA_API_KEY not configured', states: [] });
  }

  try {
    const url = `${EIA_BASE}/electricity/retail-sales/data/` +
      `?api_key=${apiKey}` +
      `&frequency=monthly` +
      `&data[0]=price` +
      `&facets[sectorid][]=98` +          // industrial sector
      `&sort[0][column]=period&sort[0][direction]=desc` +
      `&length=600`;

    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`EIA API HTTP ${res.status}`);
    const json = await res.json() as { response?: { data?: EiaPrice[] } };
    const rows = json?.response?.data ?? [];

    // Most recent period's price per state.
    // Rows are sorted period desc, so the first row we see per state is newest.
    const latestByState = new Map<string, EiaPrice>();
    let latestPeriod = '';
    for (const r of rows) {
      const id = (r.stateid || '').toUpperCase();
      if (!VALID_STATES.has(id)) continue;
      if (r.price == null) continue;
      if (!latestByState.has(id)) latestByState.set(id, r);
      if (r.period > latestPeriod) latestPeriod = r.period;
    }

    // Tracked sites per state from our DB.
    const db = getDb();
    const siteRows = db.prepare(
      `SELECT state, COUNT(*) n, COALESCE(SUM(power_capacity_mw),0) mw FROM sites GROUP BY state`
    ).all() as { state: string | null; n: number; mw: number }[];
    const tracked = new Map<string, { n: number; mw: number }>();
    for (const s of siteRows) {
      if (!s.state) continue;
      tracked.set(s.state.toUpperCase(), { n: s.n, mw: s.mw });
    }

    // Build base records.
    const base = Array.from(latestByState.values()).map(r => {
      const id = r.stateid.toUpperCase();
      const t = tracked.get(id) || { n: 0, mw: 0 };
      return {
        state: id,
        name: r.stateDescription,
        priceMwh: Math.round(r.price * 10 * 10) / 10,   // c/kWh × 10 = $/MWh, 1 decimal
        trackedSites: t.n,
        trackedMW: Math.round(t.mw),
        opportunity: false,
      };
    });

    // Cheapest tercile threshold for opportunity flag.
    const sortedPrices = base.map(b => b.priceMwh).sort((a, b) => a - b);
    const tercileIdx = Math.floor(sortedPrices.length / 3);
    const tercileThreshold = sortedPrices.length > 0
      ? sortedPrices[Math.max(0, tercileIdx - 1)]
      : Infinity;

    for (const b of base) {
      b.opportunity = b.priceMwh <= tercileThreshold && b.trackedSites <= 1;
    }

    base.sort((a, b) => a.priceMwh - b.priceMwh);

    const avgMwh = base.length
      ? Math.round((base.reduce((sum, b) => sum + b.priceMwh, 0) / base.length) * 10) / 10
      : 0;

    return NextResponse.json({
      updated: latestPeriod,
      national: {
        avgMwh,
        cheapest: base.length ? base[0].name : '',
        mostExpensive: base.length ? base[base.length - 1].name : '',
      },
      states: base,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, states: [] }, { status: 500 });
  }
}
