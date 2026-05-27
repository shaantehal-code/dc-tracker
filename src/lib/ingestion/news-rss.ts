/**
 * DC news RSS aggregator.
 * Fetches from multiple public feeds, parses without dependencies,
 * and matches articles to tracked sites.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const FEEDS = [
  // Core DC trade publications
  { url: 'https://www.datacenterdynamics.com/rss.xml',                    label: 'DCD' },
  { url: 'https://www.theregister.com/data_centre/rss',                   label: 'TheRegister' },
  { url: 'https://www.datacenterfrontier.com/feed/',                      label: 'DCFrontier' },
  { url: 'https://www.datacenterknowledge.com/rss.xml',                   label: 'DCK' },
  { url: 'https://bisnow.com/national/rss/technology',                    label: 'Bisnow' },
  { url: 'https://www.capacitymedia.com/rss',                             label: 'Capacity' },
  { url: 'https://www.lightreading.com/rss/rss_simple.asp',               label: 'LightReading' },
  { url: 'https://feeds.feedburner.com/DataCenterJournal',                label: 'DCJournal' },
  // Energy & grid publications
  { url: 'https://www.utilitydive.com/feeds/news/',                       label: 'UtilityDive' },
  { url: 'https://www.greentechmedia.com/rss/all',                        label: 'GreenTech' },
  { url: 'https://www.renewablesnow.com/feed/',                           label: 'RenewablesNow' },
  // Real estate / CRE (data center specific only)
  { url: 'https://www.globest.com/category/data-centers/feed/',           label: 'GlobeSt' },
  // Cloud/hyperscaler coverage
  { url: 'https://www.cloudpro.co.uk/feed',                               label: 'CloudPro' },
  // Google News: key targeted searches (de-duplicated from FERC/GDELT by using unique queries)
  { url: 'https://news.google.com/rss/search?q=data+center+permit+zoning+county&hl=en-US&gl=US&ceid=US:en', label: 'GNews-Permits' },
  { url: 'https://news.google.com/rss/search?q=data+center+lease+signed+colocation+announced&hl=en-US&gl=US&ceid=US:en', label: 'GNews-Leases' },
  { url: 'https://news.google.com/rss/search?q=hyperscale+"breaks+ground"+campus+megawatt&hl=en-US&gl=US&ceid=US:en', label: 'GNews-Build' },
  { url: 'https://news.google.com/rss/search?q=%22AI+campus%22+OR+%22AI+data+center%22+%22gigawatt%22+OR+%22megawatt%22&hl=en-US&gl=US&ceid=US:en', label: 'GNews-AIcampus' },
  { url: 'https://news.google.com/rss/search?q=%22nuclear%22+%22data+center%22+%22power+purchase%22+OR+%22co-location%22&hl=en-US&gl=US&ceid=US:en', label: 'GNews-Nuclear' },
  { url: 'https://news.google.com/rss/search?q=%22data+center%22+%22land+acquisition%22+OR+%22acres%22+megawatt+investment&hl=en-US&gl=US&ceid=US:en', label: 'GNews-Land' },
];

// Keywords that boost a news article's relevance to DC acquisition intelligence
const HIGH_VALUE_TERMS = [
  'megawatt','gigawatt','hyperscale','colocation','greenfield','interconnection',
  'substation','transmission','permit','campus','lease','acquisition','investment',
  'construction','nuclear','renewable','ppa','land sale','zoning','announced',
];

interface FeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  // Handle both <item> (RSS 2.0) and <entry> (Atom)
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const content = m[1];
    const title = extractTag(content, 'title');
    const description = extractTag(content, 'description') || extractTag(content, 'summary') || extractTag(content, 'content');
    const link = extractTag(content, 'link') || extractAttr(content, 'link', 'href');
    const pubDate = extractTag(content, 'pubDate') || extractTag(content, 'published') || extractTag(content, 'updated');
    if (title) items.push({ title, description, link, pubDate });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  return (re.exec(xml)?.[1] || '').replace(/<[^>]+>/g, '').trim().slice(0, 500);
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i');
  return re.exec(xml)?.[1] || '';
}

function parseDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  return HIGH_VALUE_TERMS.filter(t => lower.includes(t)).length;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DC-Tracker-Intelligence/1.0 (contact@dctracker.io)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml);
}

export async function runNewsRss(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  const results = await Promise.allSettled(
    FEEDS.map(f => fetchFeed(f.url).then(items => ({ items, label: f.label })))
  );

  for (const result of results) {
    if (result.status === 'rejected') continue;
    const { items, label } = result.value;

    for (const item of items) {
      const text = `${item.title} ${item.description}`;
      const relevance = scoreRelevance(text);
      if (relevance < 2) continue; // require ≥2 DC keywords to reduce noise

      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const matched = matchText(text, index);
      if (matched.length === 0) continue;

      const date = parseDate(item.pubDate);
      const description = `[${label}] ${item.title.slice(0, 180)}`;
      const confidence = relevance >= 3 ? 'high' : relevance >= 2 ? 'medium' : 'low';

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'news',
          date,
          description,
          sourceUrl: item.link || undefined,
          confidence: confidence as 'high' | 'medium' | 'low',
        });
      }
    }
  }

  return signals;
}
