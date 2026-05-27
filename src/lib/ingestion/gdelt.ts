/**
 * Global DC Expansion intelligence source.
 * Uses Google News RSS to monitor international data center announcements,
 * investment flows, and regional expansion beyond US trade publications.
 * Covers SE Asia, MENA, Europe, Africa, Latin America.
 * (Replaces the unreachable GDELT EFTS endpoint.)
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const GNEWS_RSS = 'https://news.google.com/rss/search';

// Globally-focused queries complementing the US-centric trade-pub feeds
const GLOBAL_QUERIES = [
  'data center construction announcement megawatt billion campus',
  'data center Singapore OR "Southeast Asia" OR Indonesia OR Malaysia hyperscale',
  'data center UAE OR "Saudi Arabia" OR Qatar OR "Middle East" megawatt campus',
  'data center "South Africa" OR Kenya OR Nigeria OR Africa hyperscale construction',
  'data center Brazil OR Chile OR Mexico OR "Latin America" campus gigawatt',
  'data center Europe Frankfurt OR Amsterdam OR Madrid OR Warsaw megawatt announced',
  '"AI campus" OR "AI data center" construction groundbreaking billion megawatt',
  'hyperscale data center "land acquisition" OR "breaks ground" OR "groundbreaking"',
];

const HIGH_VALUE_TERMS = [
  'megawatt','gigawatt','mw','gw','hyperscale','campus','construction',
  'groundbreaking','billion','million','announced','investment','expansion',
  'greenfield','co-location','colocation','tier','subsea','cable',
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

function scoreItem(title: string, description: string): number {
  const low = (title + ' ' + description).toLowerCase();
  return HIGH_VALUE_TERMS.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
}

function parseDate(pubDate: string): string {
  try { return new Date(pubDate).toISOString().slice(0, 10); }
  catch { return new Date().toISOString().slice(0, 10); }
}

export async function runGdelt(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const q of GLOBAL_QUERIES) {
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
    for (const item of items.slice(0, 15)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const score = scoreItem(item.title, item.description);
      if (score < 2) continue;

      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const matched = matchText(item.title + ' ' + item.description, index);
      if (matched.length === 0) continue;

      const date = parseDate(item.pubDate);
      const description = `Global Intel: ${cleanTitle}`;

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'news',
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
