/**
 * Job Posting Signals ingestion source.
 * Job clusters for "Data Center Construction Manager", "Critical Facilities Engineer",
 * etc. are a 6-12 month leading indicator of new campus construction.
 *
 * Approach 1: Indeed public RSS feeds (title × location combinations)
 * Approach 2: Google News RSS for mass-hiring announcements / press releases
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const GNEWS_RSS = 'https://news.google.com/rss/search';

// ---------------------------------------------------------------------------
// Approach 1: Indeed RSS
// ---------------------------------------------------------------------------

const INDEED_JOB_TITLES = [
  'data+center+construction+manager',
  'critical+facilities+engineer+data+center',
  'data+center+site+selection',
  'hyperscale+data+center+campus',
  'data+center+electrical+engineer',
];

interface IndeedLocation {
  param: string;       // URL-encoded value for the `l` query param
  siteHints: string[]; // site IDs associated with this location
}

const INDEED_LOCATIONS: IndeedLocation[] = [
  { param: 'Loudoun+County%2C+VA',  siteHints: ['loudoun-va', 'pwc-va', 'iron-mountain-nova'] },
  { param: 'Northern+Virginia',     siteHints: ['loudoun-va', 'pwc-va', 'stafford-va', 'richmond-va'] },
  { param: 'Phoenix%2C+AZ',         siteHints: ['phoenix-mesa-az', 'goodyear-az', 'aligned-chandler-az'] },
  { param: 'Columbus%2C+OH',        siteHints: ['new-albany-oh'] },
  { param: 'Dallas%2C+TX',          siteHints: ['allen-tx', 'coreweave-plano'] },
  { param: 'San+Antonio%2C+TX',     siteHints: ['san-antonio-tx'] },
  { param: 'Quincy%2C+WA',          siteHints: ['quincy-wa', 'george-wa', 'sabey-quincy'] },
  { param: 'Reno%2C+NV',            siteHints: ['reno-nv'] },
  { param: 'Henderson%2C+NV',       siteHints: ['henderson-nv'] },
  { param: 'Salt+Lake+City%2C+UT',  siteHints: ['bluffdale-ut', 'lehi-ut'] },
  { param: 'Memphis%2C+TN',         siteHints: ['memphis-tn', 'xai-memphis'] },
  { param: 'Chicago%2C+IL',         siteHints: ['aurora-il', 'dekalb-il'] },
  { param: 'Minneapolis%2C+MN',     siteHints: ['eagan-mn'] },
  { param: 'Denver%2C+CO',          siteHints: ['denver-co', 'edgecore-aurora'] },
];

// ---------------------------------------------------------------------------
// Approach 2: Google News RSS queries
// ---------------------------------------------------------------------------

interface GNewsQuery {
  query: string;
  siteHints?: string[]; // if set, pin to these sites; otherwise use site-matcher
}

const GNEWS_QUERIES: GNewsQuery[] = [
  // Broad sweep — catch any hiring press release
  {
    query: '"data center" "hiring" OR "jobs" OR "workforce" campus megawatt 2025 construction',
  },
  // Hyperscaler-specific
  {
    query: 'Microsoft "data center" jobs OR hiring Virginia OR Texas OR Ohio 2025',
  },
  {
    query: 'Amazon AWS "data center" jobs OR hiring megawatt campus 2025',
  },
  {
    query: 'Google "data center" jobs OR hiring campus 2025',
  },
  {
    query: 'Meta "data center" jobs OR hiring campus gigawatt 2025',
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const HIGH_VALUE_TERMS = [
  'data center',
  'construction',
  'critical facilities',
  'hyperscale',
  'campus',
  'megawatt',
  'gigawatt',
  'hiring',
  'workforce',
  'site selection',
  'electrical engineer',
  'commissioning',
];

function countTerms(title: string, description: string): number {
  const low = (title + ' ' + description).toLowerCase();
  return HIGH_VALUE_TERMS.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
}

function parseDate(pubDate: string): string {
  try {
    return new Date(pubDate).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// RSS parser (same pattern as ferc.ts)
// ---------------------------------------------------------------------------

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const b of blocks) {
    const title       = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)             || [])[1]?.trim() || '';
    const link        = (b.match(/<link>([\s\S]*?)<\/link>/)                                           || [])[1]?.trim() || '';
    const pubDate     = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)                                     || [])[1]?.trim() || '';
    const description = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.trim() || '';
    if (title) items.push({ title, link, pubDate, description });
  }
  return items;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Approach 1 runner
// ---------------------------------------------------------------------------

async function runIndeedRSS(
  sites: SiteStub[],
  seen: Set<string>,
): Promise<RawSignal[]> {
  const siteMap = new Map(sites.map(s => [s.id, s]));
  const signals: RawSignal[] = [];

  for (const title of INDEED_JOB_TITLES) {
    for (const loc of INDEED_LOCATIONS) {
      const targetSites = loc.siteHints.filter(id => siteMap.has(id));
      if (targetSites.length === 0) continue;

      const url = `https://www.indeed.com/rss?q=${title}&l=${loc.param}&sort=date&fromage=14`;
      let xml = '';
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DC-Tracker/1.0)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          await delay(150);
          continue;
        }
        xml = await res.text();
      } catch {
        await delay(150);
        continue;
      }
      await delay(150);

      const items = parseRSS(xml);
      for (const item of items) {
        const dedupKey = item.link || item.title.slice(0, 80);
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const date = parseDate(item.pubDate);
        const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
        const description = `Job Posting: ${cleanTitle}`;

        // Job title + location exact match → high confidence
        for (const siteId of targetSites) {
          signals.push({
            siteId,
            type: 'job_posting',
            date,
            description,
            sourceUrl: item.link || undefined,
            confidence: 'high',
          });
        }
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Approach 2 runner
// ---------------------------------------------------------------------------

async function runGNewsJobRSS(
  sites: SiteStub[],
  seen: Set<string>,
): Promise<RawSignal[]> {
  const siteIndex = buildSiteIndex(sites);
  const siteMap = new Map(sites.map(s => [s.id, s]));
  const signals: RawSignal[] = [];

  for (const { query, siteHints } of GNEWS_QUERIES) {
    const url = `${GNEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    let xml = '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DC-Tracker/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        await delay(150);
        continue;
      }
      xml = await res.text();
    } catch {
      await delay(150);
      continue;
    }
    await delay(150);

    const items = parseRSS(xml);
    for (const item of items.slice(0, 12)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;

      const termCount = countTerms(item.title, item.description);
      if (termCount < 2) continue;

      // Resolve target sites: pinned hints take priority, else use site-matcher
      let targetSites: string[];
      if (siteHints && siteHints.length > 0) {
        targetSites = siteHints.filter(id => siteMap.has(id));
      } else {
        const fullText = item.title + ' ' + item.description;
        targetSites = matchText(fullText, siteIndex);
      }
      if (targetSites.length === 0) continue;

      seen.add(dedupKey);

      const date = parseDate(item.pubDate);
      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `Job Signal: ${cleanTitle}`;
      const confidence: RawSignal['confidence'] = termCount >= 3 ? 'high' : 'medium';

      for (const siteId of targetSites) {
        signals.push({
          siteId,
          type: 'job_posting',
          date,
          description,
          sourceUrl: item.link || undefined,
          confidence,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runJobSignals(sites: SiteStub[]): Promise<RawSignal[]> {
  // Shared dedup set — run sequentially so cross-source duplicates are caught.
  const seen = new Set<string>();
  const indeedSignals = await runIndeedRSS(sites, seen);
  const gnewsSignals = await runGNewsJobRSS(sites, seen);
  return [...indeedSignals, ...gnewsSignals];
}
