/**
 * County Building Permit, Water/Industrial Permit & Zoning Change intelligence source.
 * Runs targeted Google News RSS queries for DC-heavy markets to surface permit
 * activity weeks before press coverage reaches mainstream outlets.
 */
import type { RawSignal, SiteStub, SignalType } from './types';

const GNEWS_RSS = 'https://news.google.com/rss/search';

const PERMIT_QUERIES: Array<{ query: string; signalType: SignalType; mustContain: string[]; siteHints: string[] }> = [
  // --- County building permits ---
  {
    query: 'Loudoun County Virginia "data center" permit OR construction megawatt 2025',
    signalType: 'building_permit',
    mustContain: ['loudoun', 'virginia'],
    siteHints: ['loudoun-va', 'pwc-va', 'iron-mountain-nova'],
  },
  {
    query: '"Prince William" Virginia "data center" permit OR zoning megawatt',
    signalType: 'building_permit',
    mustContain: ['prince william', 'virginia'],
    siteHints: ['pwc-va', 'stafford-va'],
  },
  {
    query: 'Maricopa Arizona "data center" permit OR zoning megawatt Phoenix Chandler',
    signalType: 'building_permit',
    mustContain: ['maricopa', 'arizona', 'chandler', 'phoenix'],
    siteHints: ['phoenix-mesa-az', 'goodyear-az', 'aligned-chandler-az'],
  },
  {
    query: '"Franklin County" Ohio "data center" permit OR construction megawatt',
    signalType: 'building_permit',
    mustContain: ['franklin', 'ohio', 'columbus'],
    siteHints: ['new-albany-oh'],
  },
  {
    query: '"Grant County" Washington "data center" permit OR construction Quincy',
    signalType: 'building_permit',
    mustContain: ['grant county', 'quincy', 'washington'],
    siteHints: ['quincy-wa', 'george-wa', 'sabey-quincy'],
  },
  {
    query: '"Clark County" Nevada "data center" permit OR construction Henderson',
    signalType: 'building_permit',
    mustContain: ['clark county', 'nevada', 'henderson'],
    siteHints: ['henderson-nv'],
  },
  {
    query: '"Washoe County" Nevada "data center" permit OR construction Reno',
    signalType: 'building_permit',
    mustContain: ['washoe county', 'reno', 'nevada'],
    siteHints: ['reno-nv'],
  },
  {
    query: '"Ada County" Idaho "data center" permit OR construction Boise',
    signalType: 'building_permit',
    mustContain: ['ada county', 'boise', 'idaho'],
    siteHints: ['boise-id'],
  },
  {
    query: '"Douglas County" OR "Arapahoe County" Colorado "data center" permit OR zoning',
    signalType: 'building_permit',
    mustContain: ['douglas county', 'arapahoe', 'colorado', 'denver'],
    siteHints: ['denver-co', 'edgecore-aurora'],
  },
  {
    query: '"Collin County" Texas "data center" permit OR construction Allen Plano',
    signalType: 'building_permit',
    mustContain: ['collin county', 'allen', 'plano', 'texas'],
    siteHints: ['allen-tx', 'coreweave-plano'],
  },
  {
    query: '"Bexar County" "San Antonio" "data center" permit OR construction',
    signalType: 'building_permit',
    mustContain: ['bexar', 'san antonio', 'texas'],
    siteHints: ['san-antonio-tx'],
  },
  {
    query: '"Washington County" Oregon Hillsboro "data center" permit OR construction',
    signalType: 'building_permit',
    mustContain: ['washington county', 'hillsboro', 'oregon'],
    siteHints: ['hillsboro-or'],
  },
  {
    query: '"Umatilla County" OR "Morrow County" Oregon "data center" permit',
    signalType: 'building_permit',
    mustContain: ['umatilla', 'morrow', 'oregon'],
    siteHints: ['umatilla-or'],
  },
  // Additional building permit markets
  {
    query: '"Henrico County" OR "Chesterfield County" Virginia "data center" permit OR construction megawatt',
    signalType: 'building_permit',
    mustContain: ['henrico', 'chesterfield', 'virginia'],
    siteHints: ['richmond-va'],
  },
  {
    query: '"Licking County" Ohio "data center" permit OR construction megawatt New Albany',
    signalType: 'building_permit',
    mustContain: ['licking', 'ohio', 'new albany'],
    siteHints: ['new-albany-oh'],
  },
  {
    query: '"Mayes County" Oklahoma "data center" permit OR construction megawatt Pryor',
    signalType: 'building_permit',
    mustContain: ['mayes', 'pryor', 'oklahoma'],
    siteHints: ['google-mayes-ok'],
  },
  {
    query: '"Travis County" OR "Webb County" Texas "data center" permit OR construction megawatt',
    signalType: 'building_permit',
    mustContain: ['travis', 'webb', 'texas'],
    siteHints: ['san-antonio-tx', 'stargate-tx'],
  },
  {
    query: '"Madison County" Alabama Huntsville "data center" permit OR construction megawatt',
    signalType: 'building_permit',
    mustContain: ['madison', 'huntsville', 'alabama'],
    siteHints: ['huntsville-al'],
  },
  // --- Water / industrial permits ---
  {
    query: 'Texas "data center" "water permit" OR "industrial water" OR "cooling water" megawatt',
    signalType: 'water_permit',
    mustContain: ['texas', 'water', 'cooling'],
    siteHints: ['san-antonio-tx', 'allen-tx', 'stargate-tx'],
  },
  {
    query: 'Nevada "data center" "water permit" OR "water rights" megawatt Reno Henderson',
    signalType: 'water_permit',
    mustContain: ['nevada', 'water'],
    siteHints: ['henderson-nv', 'reno-nv'],
  },
  {
    query: 'Virginia "data center" "water permit" OR "stormwater" megawatt Loudoun Ashburn',
    signalType: 'water_permit',
    mustContain: ['virginia', 'water', 'loudoun', 'ashburn'],
    siteHints: ['loudoun-va', 'pwc-va'],
  },
  {
    query: 'Arizona "data center" "water permit" OR "water rights" megawatt Phoenix Chandler',
    signalType: 'water_permit',
    mustContain: ['arizona', 'water', 'phoenix', 'chandler'],
    siteHints: ['phoenix-mesa-az', 'goodyear-az', 'aligned-chandler-az', 'navajo-gs-az'],
  },
  {
    query: 'Oregon "data center" "water permit" OR "industrial water" megawatt Hillsboro Umatilla',
    signalType: 'water_permit',
    mustContain: ['oregon', 'water'],
    siteHints: ['hillsboro-or', 'umatilla-or'],
  },
  {
    query: 'Idaho OR Boise "data center" "water permit" OR "water rights" megawatt',
    signalType: 'water_permit',
    mustContain: ['idaho', 'water'],
    siteHints: ['boise-id'],
  },
  // --- Zoning changes ---
  {
    query: '"Northern Virginia" OR Loudoun OR "Prince William" "data center" zoning OR rezoning OR variance 2025',
    signalType: 'zoning_change',
    mustContain: ['virginia', 'loudoun', 'prince william', 'zoning'],
    siteHints: ['loudoun-va', 'pwc-va', 'stafford-va'],
  },
  {
    query: 'Texas "data center" zoning OR rezoning OR variance OR SUP megawatt 2025',
    signalType: 'zoning_change',
    mustContain: ['texas', 'zoning', 'rezoning'],
    siteHints: ['san-antonio-tx', 'allen-tx', 'stargate-tx'],
  },
  {
    query: 'Arizona Phoenix Chandler "data center" zoning OR rezoning OR variance 2025',
    signalType: 'zoning_change',
    mustContain: ['arizona', 'zoning', 'phoenix', 'chandler'],
    siteHints: ['phoenix-mesa-az', 'aligned-chandler-az'],
  },
  {
    query: 'Ohio "New Albany" OR Columbus "data center" zoning OR rezoning OR variance 2025',
    signalType: 'zoning_change',
    mustContain: ['ohio', 'zoning'],
    siteHints: ['new-albany-oh'],
  },
  {
    query: 'Nevada Reno Henderson "data center" zoning OR rezoning OR variance 2025',
    signalType: 'zoning_change',
    mustContain: ['nevada', 'zoning'],
    siteHints: ['henderson-nv', 'reno-nv'],
  },
  {
    query: 'Oregon Hillsboro Umatilla "data center" zoning OR rezoning OR variance 2025',
    signalType: 'zoning_change',
    mustContain: ['oregon', 'zoning'],
    siteHints: ['hillsboro-or', 'umatilla-or'],
  },
];

const HIGH_VALUE_TERMS = [
  'permit', 'zoning', 'variance', 'rezoning', 'construction', 'megawatt', 'gigawatt',
  'mw', 'gw', 'campus', 'substation', 'utility', 'data center', 'industrial', 'approval',
  'conditional',
];

interface GNewsItem { title: string; link: string; pubDate: string; description: string }

function parseGNewsRSS(xml: string): GNewsItem[] {
  const items: GNewsItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const b of blocks) {
    const title   = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim() || '';
    const link    = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || '';
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]?.trim() || '';
    const desc    = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.trim() || '';
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

function labelForType(signalType: SignalType): string {
  if (signalType === 'zoning_change') return 'Zoning';
  if (signalType === 'water_permit') return 'Water Permit';
  return 'Building Permit';
}

export async function runPermitTracker(sites: SiteStub[]): Promise<RawSignal[]> {
  const siteMap = new Map(sites.map(s => [s.id, s]));
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const { query, signalType, mustContain, siteHints } of PERMIT_QUERIES) {
    let xml = '';
    try {
      const url = `${GNEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DC-Tracker/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      xml = await res.text();
      await new Promise(r => setTimeout(r, 150));
    } catch { continue; }

    const items = parseGNewsRSS(xml);
    const targetSites = siteHints.filter(id => siteMap.has(id));
    if (targetSites.length === 0) continue;

    for (const item of items.slice(0, 12)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;

      const fullText = (item.title + ' ' + item.description).toLowerCase();
      const locationMatch = mustContain.some(kw => fullText.includes(kw.toLowerCase()));
      if (!locationMatch) continue;

      seen.add(dedupKey);

      const score = scoreItem(item.title, item.description);
      if (score < 2) continue;

      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `${labelForType(signalType)}: ${cleanTitle}`;
      const date = parseDate(item.pubDate);

      for (const siteId of targetSites) {
        signals.push({
          siteId,
          type: signalType,
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
