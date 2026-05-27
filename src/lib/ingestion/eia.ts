/**
 * EIA (Energy Information Administration) electricity data ingester.
 * Fetches retail electricity prices by state and generates signals
 * when costs change materially or new low-cost power zones emerge.
 *
 * Requires env var EIA_API_KEY (free at https://www.eia.gov/opendata/register.php).
 * Gracefully skips if key is not set.
 */
import type { RawSignal, SiteStub } from './types';

const EIA_BASE = 'https://api.eia.gov/v2';

// US state abbreviation → site IDs that care about that state's power cost
// Derived from the seed data — we track DC-rich states
const STATE_SITES: Record<string, string[]> = {
  VA: ['pwc-va','loudoun-va','stafford-va','richmond-va','iron-mountain-nova'],
  OH: ['new-albany-oh','killen-oh'],
  TX: ['san-antonio-tx','allen-tx','stargate-tx','coreweave-plano','cipher-odessa'],
  TN: ['memphis-tn','clarksville-tn','smyrna-tn','xai-memphis'],
  WY: ['cheyenne-wy'],
  WA: ['george-wa','quincy-wa','sabey-quincy','seattle-wa'],
  IA: ['waukee-ia'],
  NC: ['rtp-nc'],
  GA: ['atlanta-douglas-ga'],
  IN: ['indianapolis-in'],
  IL: ['aurora-il','dekalb-il'],
  MN: ['eagan-mn'],
  AZ: ['phoenix-mesa-az','goodyear-az','tucson-az','aligned-chandler-az'],
  NV: ['henderson-nv','reno-nv'],
  UT: ['bluffdale-ut','lehi-ut','novva-utah'],
  CO: ['denver-co','edgecore-aurora'],
  OR: ['umatilla-or','hillsboro-or'],
  ID: ['boise-id'],
  NY: ['plattsburgh-ny'],
  PA: ['homer-city-pa','nuclear-berwick-pa','talen-nuclear-pa'],
  MA: ['brayton-point-ma'],
  AL: ['huntsville-al'],
  OK: ['oklahoma-city-ok','google-mayes-ok'],
  MO: ['kansas-city-mo','stlouis-mo'],
  WI: ['microsoft-racine'],
  WV: ['monarch-wv'],
  LA: ['meta-louisiana'],
  FL: ['miami-fl'],
  NJ: ['secaucus-nj'],
};

interface EiaPrice {
  period: string;   // YYYY-MM
  stateid: string;
  stateDescription: string;
  price: number;    // cents per kWh
  units: string;
}

async function fetchStatePrices(apiKey: string): Promise<EiaPrice[]> {
  const url = `${EIA_BASE}/electricity/retail-sales/data/` +
    `?api_key=${apiKey}` +
    `&frequency=monthly` +
    `&data[0]=price` +
    `&facets[sectorid][]=98` +   // industrial sector
    `&sort[0][column]=period` +
    `&sort[0][direction]=desc` +
    `&length=60`;                 // last 5 years for trend

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`EIA API HTTP ${res.status}`);
  const json = await res.json() as { response?: { data?: EiaPrice[] } };
  return json?.response?.data ?? [];
}

export async function runEia(sites: SiteStub[]): Promise<RawSignal[]> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    console.log('[EIA] Skipping — EIA_API_KEY not set. Get a free key at https://www.eia.gov/opendata/register.php');
    return [];
  }

  const signals: RawSignal[] = [];
  const prices = await fetchStatePrices(apiKey);

  // Group by state, find latest 2 periods to compute change
  const byState = new Map<string, EiaPrice[]>();
  for (const p of prices) {
    if (!byState.has(p.stateid)) byState.set(p.stateid, []);
    byState.get(p.stateid)!.push(p);
  }

  for (const [state, data] of Array.from(byState.entries())) {
    const siteIds = STATE_SITES[state];
    if (!siteIds || siteIds.length === 0) continue;
    if (data.length < 2) continue;

    // Most recent two readings
    const [latest, prev] = data;
    if (!latest.price || !prev.price) continue;

    const latestMwh = latest.price * 10; // c/kWh × 10 = $/MWh
    const prevMwh = prev.price * 10;
    const changePct = ((latestMwh - prevMwh) / prevMwh) * 100;

    // Generate signal only for notable changes (>5%) or notably low prices (<$45/MWh)
    const isLow = latestMwh < 45;
    const isBigChange = Math.abs(changePct) >= 5;

    if (!isLow && !isBigChange) continue;

    const direction = changePct > 0 ? 'up' : 'down';
    const changeStr = Math.abs(changePct).toFixed(1);
    let description: string;

    if (isBigChange) {
      description = `EIA ${latest.period}: ${state} industrial electricity ${direction} ${changeStr}% to $${latestMwh.toFixed(0)}/MWh (from $${prevMwh.toFixed(0)})`;
    } else {
      description = `EIA ${latest.period}: ${state} industrial electricity at $${latestMwh.toFixed(0)}/MWh — among lowest-cost US markets`;
    }

    const date = latest.period + '-01';
    const confidence = isBigChange ? 'high' : 'medium';

    for (const siteId of siteIds) {
      // Only assign to sites that actually exist in the DB
      const site = sites.find(s => s.id === siteId);
      if (!site) continue;
      signals.push({
        siteId,
        type: 'news',
        date,
        description,
        sourceUrl: `https://www.eia.gov/electricity/data/browser/#/topic/7?agg=0&geo=g${state}&freq=M`,
        confidence: confidence as 'high' | 'medium',
      });
    }
  }

  return signals;
}
