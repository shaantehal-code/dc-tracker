/**
 * FERC Docket Tracker — ingests FERC's official news RSS feed and targeted
 * Google News queries for FERC policy items (Order 2023, ER dockets, meeting
 * outcomes) relevant to data center site interconnection timelines.
 *
 * No API key required — uses FERC's public news feed and Google News RSS.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';
import { yearHint } from './util';

const FERC_RSS = 'https://www.ferc.gov/node/feed.xml';

// High-value FERC terms for interconnection / large-load policy
const HIGH_VALUE = [
  'interconnection', 'large load', 'data center', 'order 2023', 'generator interconnection',
  'transmission', 'cluster study', 'fast-track', 'energy storage', 'nuclear', 'ppa',
  'capacity', 'gigawatt', 'megawatt', 'substation', 'load growth',
];

function buildGnewsQueries(): string[] {
  const yh = yearHint();
  return [
    `FERC Order 2023 interconnection reform transmission ${yh}`,
    'FERC large load interconnection data center utility agreement',
    `FERC ER docket interconnection agreement approved ${yh}`,
    'FERC meeting order transmission data center hyperscaler',
    `FERC interconnection queue reform PJM MISO ERCOT ${yh}`,
  ];
}

function scoreItem(title: string, desc: string): number {
  const text = `${title} ${desc}`.toLowerCase();
  return HIGH_VALUE.filter(t => text.includes(t)).length;
}

async function fetchFercRss(sites: SiteStub[], index: ReturnType<typeof buildSiteIndex>): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  try {
    const res = await fetch(FERC_RSS, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const text = await res.text();
    const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const item of items.slice(0, 20)) {
      const title   = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]    || item.match(/<title>(.*?)<\/title>/)?.[1]       || '';
      const link    = item.match(/<link>(.*?)<\/link>/)?.[1]                       || '';
      const desc    = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]?.replace(/<[^>]+>/g, '') || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]                 || '';

      if (!title || seen.has(link || title)) continue;
      seen.add(link || title);

      const score = scoreItem(title, desc);
      if (score < 1) continue; // skip unrelated FERC news

      const confidence = score >= 3 ? 'high' : 'medium';
      const date = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const combined = `${title} ${desc}`;
      const matched = matchText(combined, index, 3);

      // FERC policy items affect all US sites — if no site-specific match, attach to high-scoring US sites
      const targetIds = matched.length > 0
        ? matched
        : sites.filter(s => ['northeast','southeast','midwest','southwest','mountain','northwest'].includes(s.region)).slice(0, 3).map(s => s.id);

      for (const siteId of targetIds) {
        signals.push({
          siteId,
          type: 'interconnection_request',
          date,
          description: `FERC: ${title.slice(0, 200)}`,
          sourceUrl: link || FERC_RSS,
          confidence,
        });
      }
    }
  } catch { /* non-fatal */ }

  return signals;
}

async function fetchFercGNews(sites: SiteStub[], index: ReturnType<typeof buildSiteIndex>): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const query of buildGnewsQueries()) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

      for (const item of items.slice(0, 6)) {
        const title   = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]    || item.match(/<title>(.*?)<\/title>/)?.[1]       || '';
        const link    = item.match(/<link>(.*?)<\/link>/)?.[1]                       || '';
        const desc    = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]?.replace(/<[^>]+>/g, '') || '';
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]                 || '';

        if (!title || seen.has(link || title)) continue;
        seen.add(link || title);

        const score = scoreItem(title, desc);
        if (score < 2) continue;

        const date = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const matched = matchText(`${title} ${desc}`, index, 2);
        if (matched.length === 0) continue;

        for (const siteId of matched) {
          signals.push({
            siteId,
            type: 'interconnection_request',
            date,
            description: `FERC policy: ${title.slice(0, 200)}`,
            sourceUrl: link || undefined,
            confidence: score >= 4 ? 'high' : 'medium',
          });
        }
      }
    } catch { /* non-fatal */ }
  }

  return signals;
}

export async function runFercDockets(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const [rssSignals, gnewsSignals] = await Promise.all([
    fetchFercRss(sites, index),
    fetchFercGNews(sites, index),
  ]);
  return [...rssSignals, ...gnewsSignals];
}
