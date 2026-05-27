/**
 * Power Grid & Interconnection intelligence source.
 * Uses Google News RSS to find PPA deals, nuclear power agreements,
 * grid interconnection events, and utility-scale power news for data centers.
 * (Replaces the unreachable FERC EFTS endpoint.)
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const GNEWS_RSS = 'https://news.google.com/rss/search';

// Power/grid queries that complement the trade-pub RSS feeds
const POWER_QUERIES = [
  'data center "power purchase agreement" megawatt',
  'data center nuclear power deal gigawatt utility',
  'hyperscale "grid interconnection" OR "transmission upgrade" megawatt',
  'data center "utility deal" OR "energy deal" gigawatt announced',
  '"AI campus" OR "AI data center" power megawatt utility construction',
  'data center "co-location" "nuclear" OR "SMR" power deal',
];

const HIGH_VALUE_TERMS = [
  'megawatt','gigawatt','mw','gw','nuclear','ppa','interconnection',
  'transmission','hyperscale','campus','utility','offtake','reactor',
  'smr','solar','wind','storage','grid','power',
];

interface GNewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseGNewsRSS(xml: string): GNewsItem[] {
  const items: GNewsItem[] = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const block of itemBlocks) {
    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim() || '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]?.trim() || '';
    const desc = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.trim() || '';
    if (title) items.push({ title, link, pubDate, description: desc });
  }
  return items;
}

function scoreItem(title: string): number {
  const low = title.toLowerCase();
  return HIGH_VALUE_TERMS.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
}

function parseDate(pubDate: string): string {
  try { return new Date(pubDate).toISOString().slice(0, 10); }
  catch { return new Date().toISOString().slice(0, 10); }
}

export async function runFerc(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const q of POWER_QUERIES) {
    let xml = '';
    try {
      const url = `${GNEWS_RSS}?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DC-Tracker/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      xml = await res.text();
      await new Promise(r => setTimeout(r, 200));
    } catch { continue; }

    const items = parseGNewsRSS(xml);
    for (const item of items.slice(0, 20)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const score = scoreItem(item.title);
      if (score < 2) continue;

      const matched = matchText(item.title + ' ' + item.description, index);
      if (matched.length === 0) continue;

      const date = parseDate(item.pubDate);
      // Strip "- Publisher Name" suffix from Google News titles
      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `Power Grid: ${cleanTitle}`;

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'interconnection_request',
          date,
          description,
          sourceUrl: item.link || undefined,
          confidence: score >= 4 ? 'high' : 'medium',
        });
      }
    }
  }

  return signals;
}
