/**
 * FERC eLibrary full-text search ingester.
 * Searches public FERC filings for interconnection requests and
 * transmission upgrades related to data center load.
 * No authentication required.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const FERC_EFTS = 'https://efts.ferc.gov/LATEST/search-index';

interface FercHit {
  _id: string;
  _score: number;
  _source: {
    date_filed?: string;
    filed_date?: string;
    title?: string;
    document_name?: string;
    description?: string;
    filer_name?: string;
    item_type?: string;
    accession_num?: string;
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function searchFerc(query: string, startDate: string): Promise<FercHit[]> {
  const url = `${FERC_EFTS}?q=${encodeURIComponent(query)}&dateRange=custom&startdt=${startDate}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DC-Tracker-Intelligence/1.0 (contact@dctracker.io)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`FERC EFTS HTTP ${res.status}`);
  const json = await res.json() as { hits?: { hits?: FercHit[] } };
  return json?.hits?.hits ?? [];
}

export async function runFerc(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();
  const startDate = daysAgo(60);

  const queries = [
    '"data center" "interconnection" "megawatt"',
    '"hyperscale" "large load" "transmission"',
    '"data center" "service request" "generator"',
    '"co-location" "nuclear" "data center"',
    '"artificial intelligence" "data center" "load" "gigawatt"',
  ];

  for (const q of queries) {
    let hits: FercHit[] = [];
    try {
      hits = await searchFerc(q, startDate);
      await new Promise(r => setTimeout(r, 200));
    } catch { continue; }

    for (const hit of hits.slice(0, 10)) {
      const src = hit._source;
      const rawDate = src.date_filed || src.filed_date || '';
      const title = src.title || src.document_name || '';
      const filer = src.filer_name || '';
      const desc = src.description || '';

      if (!title && !filer) continue;

      const dedupKey = hit._id || `${filer}-${rawDate}-${title.slice(0, 40)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const text = `${title} ${filer} ${desc}`;
      const matched = matchText(text, index);
      if (matched.length === 0) continue;

      let date: string;
      try { date = new Date(rawDate).toISOString().slice(0, 10); }
      catch { date = new Date().toISOString().slice(0, 10); }

      const description = `FERC filing: ${filer ? filer + ' — ' : ''}${(title || desc).slice(0, 200)}`;
      const sourceUrl = src.accession_num
        ? `https://elibrary.ferc.gov/eLibrary/docSearch?accession_num=${src.accession_num}`
        : 'https://elibrary.ferc.gov/eLibrary/search';

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'interconnection_request',
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
