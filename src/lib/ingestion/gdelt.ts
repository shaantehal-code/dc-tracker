/**
 * GDELT (Global Database of Events, Language, and Tone) ingester.
 * GDELT monitors news from 100+ languages globally, updated every 15 minutes.
 * Free, no authentication required.
 * Covers international DC news that RSS feeds miss (Asia, LatAm, MENA).
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const GDELT_DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';

interface GdeltArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string;   // YYYYMMDDTHHMMSSZ
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
  status?: string;
}

// Queries optimised for DC acquisition intelligence
const GDELT_QUERIES = [
  { q: 'data center megawatt construction',               timespan: '14d', label: 'DC Construction' },
  { q: 'hyperscale data center land acquisition',         timespan: '14d', label: 'DC Land' },
  { q: 'data center interconnection power gigawatt',      timespan: '14d', label: 'DC Power' },
  { q: 'Equinix OR "Digital Realty" OR CoreWeave expansion', timespan: '7d', label: 'DC REITs' },
  { q: 'AI data center nuclear power colocation',         timespan: '14d', label: 'Nuclear DC' },
  { q: 'data center Malaysia Johor OR Indonesia OR Vietnam', timespan: '14d', label: 'SE Asia DC' },
  { q: 'data center Middle East Saudi UAE',               timespan: '14d', label: 'MENA DC' },
  { q: 'data center Africa Lagos Nairobi Kenya',          timespan: '14d', label: 'Africa DC' },
];

function parseGdeltDate(raw: string): string {
  // Format: 20250115T120000Z
  try {
    const y = raw.slice(0, 4);
    const mo = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return `${y}-${mo}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function fetchGdelt(query: string, timespan: string): Promise<GdeltArticle[]> {
  const url = `${GDELT_DOC}?` + new URLSearchParams({
    query,
    mode: 'artlist',
    maxrecords: '25',
    timespan,
    format: 'json',
    sort: 'DateDesc',
  });

  const res = await fetch(url, {
    headers: { 'User-Agent': 'DC-Tracker-Intelligence/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
  const json = await res.json() as GdeltResponse;
  return json?.articles ?? [];
}

export async function runGdelt(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  // Stagger requests to avoid hammering GDELT
  for (const { q, timespan, label } of GDELT_QUERIES) {
    let articles: GdeltArticle[] = [];
    try {
      articles = await fetchGdelt(q, timespan);
      await new Promise(r => setTimeout(r, 300));
    } catch { continue; }

    for (const article of articles) {
      if (seen.has(article.url)) continue;
      seen.add(article.url);

      const text = `${article.title} ${article.domain || ''} ${article.sourcecountry || ''}`;
      const matched = matchText(text, index);
      if (matched.length === 0) continue;

      const date = parseGdeltDate(article.seendate);
      const description = `[GDELT/${label}] ${article.title.slice(0, 200)}`;
      const confidence = article.language === 'English' ? 'medium' : 'low';

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'news',
          date,
          description,
          sourceUrl: article.url,
          confidence: confidence as 'medium' | 'low',
        });
      }
    }
  }

  return signals;
}
