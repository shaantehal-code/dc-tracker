/**
 * SEC EDGAR full-text search ingester.
 * Uses the public EDGAR EFTS API (no auth required, 10 req/s limit).
 * Searches recent 8-K, 10-K, S-1 filings mentioning data center infrastructure.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const EFTS_BASE = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_BASE = 'https://www.sec.gov';

// DC-specific public companies to amplify signals for (CIK → ticker)
const DC_COMPANIES: Record<string, string> = {
  // Pure-play data center REITs & operators
  '1101239': 'EQIX',    // Equinix
  '1297996': 'DLR',     // Digital Realty
  '1020569': 'IRM',     // Iron Mountain
  '1591698': 'CONE',    // CyrusOne (now private)
  '1411059': 'QTS',     // QTS Realty (now private)
  '1626878': 'SWCH',    // Switch Inc (now private)
  // AI/cloud operators
  '1960944': 'CRWV',    // CoreWeave
  '1743745': 'APLD',    // Applied Digital
  '1787640': 'CIFR',    // Cipher Mining
  '1839175': 'CORZ',    // Core Scientific
  '1507605': 'MARA',    // MARA Holdings
  '1514281': 'RIOT',    // Riot Platforms
  '1835016': 'BTBT',    // Bit Digital
  // Hyperscalers
  '1018724': 'AMZN',    // Amazon (AWS)
  '789019':  'MSFT',    // Microsoft
  '1652044': 'GOOGL',   // Alphabet
  '1326801': 'META',    // Meta
  '320193':  'AAPL',    // Apple
  '1045810': 'NVDA',    // Nvidia
  '1467858': 'TSLA',    // Tesla (Dojo supercomputer)
  // Power/utilities
  '78814':   'D',       // Dominion Energy (VA grid)
  '1551152': 'VST',     // Vistra (nuclear power)
  '1013871': 'NRG',     // NRG Energy
  '1168165': 'AEE',     // Ameren (MO/IL)
  // International DC operators
  '1569158': 'GDS',     // GDS Holdings (China)
  '1372514': 'VNET',    // Vnet Group (China)
  '1410172': 'KDCREIT', // Keppel DC REIT (SG - proxy)
};

interface EdgarHit {
  _id: string;
  _source: {
    display_names?: string[];   // e.g. "EQUINIX INC  (EQIX)  (CIK 0001101239)"
    file_date?: string;         // YYYY-MM-DD
    form?: string;              // "8-K", "10-K", etc.
    root_forms?: string[];
    adsh?: string;              // accession number e.g. "0001193125-25-012345"
    ciks?: string[];
    biz_locations?: string[];   // e.g. ["Redwood City, CA"]
    file_description?: string;
    items?: string[];
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function searchEdgar(query: string, forms: string, startDate: string): Promise<EdgarHit[]> {
  const url = `${EFTS_BASE}?q=${encodeURIComponent(query)}&forms=${forms}&dateRange=custom&startdt=${startDate}&hits.hits.total.value=true`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'dc-tracker-intelligence contact@dctracker.io' },
  });
  if (!res.ok) throw new Error(`EDGAR search HTTP ${res.status}`);
  const json = await res.json() as { hits?: { hits?: EdgarHit[] } };
  return json?.hits?.hits ?? [];
}


export async function runSecEdgar(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();
  const startDate = daysAgo(45);

  const queries = [
    { q: '"data center" "megawatt" "construction"', forms: '8-K' },
    { q: '"data center" "interconnection" "gigawatt"', forms: '8-K' },
    { q: '"hyperscale" "data center" "expansion"', forms: '8-K' },
    { q: '"nuclear" "data center" OR "co-location" "power purchase"', forms: '8-K' },
    { q: '"data center" "greenfield" OR "campus" "announced"', forms: '8-K,10-K' },
    { q: '"AI campus" OR "AI data center" "megawatt" OR "gigawatt"', forms: '8-K' },
    { q: '"data center" "land" "acquisition" OR "purchase" "acres"', forms: '8-K' },
    { q: '"colocation" OR "co-location" "lease" "megawatt" "data center"', forms: '8-K' },
    { q: '"data center" "power" "agreement" "utility"', forms: '8-K,10-K' },
  ];

  for (const { q, forms } of queries) {
    let hits: EdgarHit[] = [];
    try {
      hits = await searchEdgar(q, forms, startDate);
      await new Promise(r => setTimeout(r, 150)); // respect 10 req/s limit
    } catch { continue; }

    for (const hit of hits.slice(0, 15)) {
      const src = hit._source;
      if (!src.file_date) continue;

      const entityName = src.display_names?.[0]?.split('  (')?.[0]?.trim() || 'Unknown Entity';
      const cik = src.ciks?.[0]?.replace(/^0+/, '') || '';
      const formType = src.form || src.root_forms?.[0] || '8-K';
      const location = src.biz_locations?.[0] || '';

      const dedupKey = src.adsh || `${entityName}-${src.file_date}-${formType}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const text = `${entityName} ${location} ${src.file_description || ''}`;
      const matched = matchText(text, index);

      // Boost for known DC companies
      const isKnownDc = cik && DC_COMPANIES[cik];
      const targetSites: string[] = [...matched];

      if (targetSites.length === 0 && isKnownDc) {
        const ticker = DC_COMPANIES[cik];
        const byTicker = matchText(ticker + ' ' + entityName, index);
        targetSites.push(...byTicker.slice(0, 2));
      }

      if (targetSites.length === 0) continue;

      const date = src.file_date.slice(0, 10);
      const description = `${entityName} files ${formType}${location ? ` (${location})` : ''}: ${src.file_description || 'material corporate event'}`;
      const sourceUrl = src.adsh
        ? `${EDGAR_BASE}/Archives/edgar/data/${cik}/${src.adsh.replace(/-/g, '')}/`
        : cik
          ? `${EDGAR_BASE}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${formType}&dateb=&owner=include&count=10`
          : undefined;

      for (const siteId of targetSites) {
        signals.push({
          siteId,
          type: 'sec_filing',
          date,
          description,
          sourceUrl,
          confidence: 'high',
        });
      }
    }
  }

  return signals;
}
