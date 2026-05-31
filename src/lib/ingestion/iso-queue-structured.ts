/**
 * ISO Queue Structured Data — upgrades interconnection signals from news articles
 * to actual EIA Form 860M generator registry data.
 *
 * Fetches planned / under-construction generators ≥200 MW with county, technology,
 * and balancing-authority fields from the EIA API (requires EIA_API_KEY).
 * Each generator is matched to DC Tracker sites via site-matcher.
 *
 * Also makes a lightweight FERC eLibrary search for recent ER docket filings.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const EIA_BASE = 'https://api.eia.gov/v2';

// Technologies that suggest large dedicated-load interconnection (exclude solar/wind farms)
const LOAD_TECH_KEYWORDS = [
  'natural gas', 'nuclear', 'battery', 'pumped', 'hydrogen',
  'combustion turbine', 'combined cycle', 'landfill gas',
];

interface EiaGen {
  period: string;
  stateid: string;
  'nameplate-capacity-mw': number;
  'net-summer-capacity-mw'?: number;
  'entity-name'?: string;
  'generator-id'?: string;
  county?: string;
  'technology-description'?: string;
  'balancing-authority-name'?: string;
}

async function fetchExpandedQueue(apiKey: string): Promise<EiaGen[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 9);
  const start = sixMonthsAgo.toISOString().slice(0, 7);

  const url =
    `${EIA_BASE}/electricity/operating-generator-capacity/data/` +
    `?api_key=${apiKey}` +
    `&facets[status][]=P&facets[status][]=V` +
    `&data[0]=nameplate-capacity-mw` +
    `&data[1]=net-summer-capacity-mw` +
    `&data[2]=county` +
    `&data[3]=technology-description` +
    `&data[4]=balancing-authority-name` +
    `&frequency=monthly` +
    `&sort[0][column]=nameplate-capacity-mw&sort[0][direction]=desc` +
    `&start=${start}&length=500`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const json = await res.json() as { response?: { data?: EiaGen[] } };
    return json?.response?.data ?? [];
  } catch { return []; }
}

// FERC eLibrary — search for recent ER dockets (interconnection rate filings)
const FERC_GNEWS_QUERIES = [
  'FERC ER docket interconnection agreement data center 2025',
  'FERC Order 2023 compliance interconnection queue reform transmission',
  'FERC large load interconnection request data center campus',
  'FERC generator interconnection agreement nuclear data center 2025',
];

async function fetchFercDocketNews(sites: SiteStub[], index: ReturnType<typeof buildSiteIndex>): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  const seenUrl = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  for (const query of FERC_GNEWS_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

      for (const item of items.slice(0, 8)) {
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
        const link  = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const desc  = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]?.replace(/<[^>]+>/g, '') || '';
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

        if (!title || seenUrl.has(link)) continue;
        seenUrl.add(link);

        const combined = `${title} ${desc}`;
        const lcCombined = combined.toLowerCase();
        const hasRelevantTerms = ['ferc','interconnection','docket','order 2023','transmission'].some(t => lcCombined.includes(t));
        if (!hasRelevantTerms) continue;

        const matched = matchText(combined, index, 2);
        const date = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : today;

        for (const siteId of matched) {
          signals.push({
            siteId,
            type: 'interconnection_request',
            date,
            description: `FERC docket: ${title.slice(0, 180)}`,
            sourceUrl: link || undefined,
            confidence: 'medium',
          });
        }
      }
    } catch { /* non-fatal */ }
  }

  return signals;
}

export async function runIsoQueueStructured(sites: SiteStub[]): Promise<RawSignal[]> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    console.log('[ISO-Queue-Structured] Skipping EIA portion — EIA_API_KEY not set');
  }

  const signals: RawSignal[] = [];
  const index = buildSiteIndex(sites);
  const seen = new Set<string>();

  // ── EIA-860M expanded structured data ────────────────────────────────────
  if (apiKey) {
    const generators = await fetchExpandedQueue(apiKey);

    for (const gen of generators) {
      const mw = gen['nameplate-capacity-mw'];
      if (!mw || mw < 200) continue;

      const tech = (gen['technology-description'] || '').toLowerCase();
      const isLoadTech = !tech || LOAD_TECH_KEYWORDS.some(k => tech.includes(k));
      // Skip utility-scale solar/wind — they don't represent DC load
      if (tech.includes('solar') || tech.includes('wind') || tech.includes('photovoltaic')) continue;
      if (!isLoadTech) continue;

      const county    = gen.county || '';
      const state     = gen.stateid?.toUpperCase() || '';
      const authority = gen['balancing-authority-name'] || '';
      const entity    = gen['entity-name'] || 'Unknown';
      const genId     = gen['generator-id'] || '';
      const techLabel = gen['technology-description'] || 'Unknown technology';

      const matchText_ = `${county} ${state} ${authority} ${entity}`;
      const matched = matchText(matchText_, index, 3);
      if (matched.length === 0) continue;

      const dedupKey = `eia860-${state}-${county}-${Math.round(mw)}-${entity}`.toLowerCase().replace(/\s+/g, '-');
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const date = gen.period ? gen.period + '-01' : new Date().toISOString().slice(0, 10);
      const locationStr = county ? `${county} County, ${state}` : state;
      const authorityStr = authority ? ` (${authority})` : '';
      const description = `EIA-860M queue: ${entity}${genId ? ` [${genId}]` : ''} — ${Math.round(mw)} MW ${techLabel} planned in ${locationStr}${authorityStr}`;

      const confidence = mw >= 500 ? 'high' : 'medium';

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'interconnection_request',
          date,
          description,
          sourceUrl: 'https://www.eia.gov/electricity/data/eia860m/',
          confidence,
        });
      }
    }
  }

  // ── FERC docket news (no API key required) ────────────────────────────────
  const fercSignals = await fetchFercDocketNews(sites, index);
  signals.push(...fercSignals);

  return signals;
}
