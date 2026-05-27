/**
 * ISO/RTO Interconnection Queue Intelligence
 *
 * Monitors all 7 major US ISO/RTO interconnection queues plus key
 * vertically-integrated utilities, Canadian grid operators, and the
 * FERC official news RSS feed.
 *
 * ISO/RTO coverage:
 *   PJM     — VA / OH / PA / NJ / WV / NC / MD / IL / IN / MI / DE
 *   ERCOT   — TX (island grid)
 *   MISO    — IL / MN / IA / MO / WI / IN / TN / AL / LA (midwest+south)
 *   SPP     — OK / KS / NE / WY / CO (southwest power pool)
 *   NYISO   — NY (Plattsburgh hydro zone)
 *   ISO-NE  — MA / CT / RI / NH / VT / ME (Brayton Point)
 *   WECC    — WA / OR / NV / AZ / UT / ID / CO (western interconnect)
 *   Non-ISO — TVA (TN/AL), Duke (NC/GA), Dominion (VA), Xcel (CO/MN/WY)
 *   Canada  — IESO (ON), BC Hydro (BC), Hydro-Québec (QC)
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const GNEWS_RSS  = 'https://news.google.com/rss/search';
const FERC_RSS   = 'https://www.ferc.gov/news-events/news-releases/rss.xml';
const DOE_RSS    = 'https://www.energy.gov/rss.xml';

const HIGH_VALUE_TERMS = [
  'megawatt','gigawatt','mw','gw','interconnection','queue','large load',
  'service request','transmission','substation','ppa','nuclear','campus',
  'utility','data center','hyperscale','load study','power purchase',
];

// Per-ISO targeted queries with location guard + deterministic site hints
const ISO_QUERIES: Array<{
  iso: string;
  query: string;
  mustContain: string[];
  siteHints: string[];
}> = [
  // ─── PJM: Mid-Atlantic + Midwest ──────────────────────────────────────────
  {
    iso: 'PJM-VA',
    query: 'PJM Virginia Dominion "interconnection queue" OR "large load" "data center" megawatt',
    mustContain: ['pjm','virginia','dominion','loudoun','ashburn','stafford'],
    siteHints: ['loudoun-va','pwc-va','stafford-va','richmond-va','iron-mountain-nova'],
  },
  {
    iso: 'PJM-OH-PA',
    query: 'PJM Ohio Pennsylvania AEP FirstEnergy "interconnection" "data center" megawatt',
    mustContain: ['pjm','ohio','pennsylvania','aep','firstenergy'],
    siteHints: ['new-albany-oh','killen-oh','homer-city-pa','nuclear-berwick-pa','talen-nuclear-pa'],
  },
  {
    iso: 'PJM-NJ-MD',
    query: 'PJM "New Jersey" Maryland Delaware "interconnection" "data center" megawatt PSE&G',
    mustContain: ['pjm','jersey','maryland','delaware'],
    siteHints: ['secaucus-nj'],
  },
  {
    iso: 'PJM-WV-NC',
    query: 'PJM "West Virginia" OR "North Carolina" "data center" megawatt "interconnection" Duke',
    mustContain: ['pjm','west virginia','north carolina','moorefield','rtp'],
    siteHints: ['monarch-wv','rtp-nc'],
  },
  {
    iso: 'PJM-NY',
    query: 'PJM OR NYISO "New York" Plattsburgh "data center" megawatt hydro "interconnection"',
    mustContain: ['pjm','nyiso','new york','plattsburgh'],
    siteHints: ['plattsburgh-ny'],
  },
  // ─── ERCOT: Texas ─────────────────────────────────────────────────────────
  {
    iso: 'ERCOT-DFW',
    query: 'ERCOT Texas "DFW" OR Dallas OR Plano "data center" megawatt "large load" OR "interconnection"',
    mustContain: ['ercot','texas','dallas','plano','allen','dfw'],
    siteHints: ['allen-tx','coreweave-plano'],
  },
  {
    iso: 'ERCOT-SA',
    query: 'ERCOT "San Antonio" OR Abilene OR Odessa "data center" megawatt "interconnection" CPS',
    mustContain: ['ercot','san antonio','abilene','odessa','cps'],
    siteHints: ['san-antonio-tx','stargate-tx','cipher-odessa'],
  },
  {
    iso: 'ERCOT-General',
    query: 'ERCOT Texas "interconnection queue" OR "large load study" "data center" gigawatt 2025',
    mustContain: ['ercot','texas','interconnection'],
    siteHints: ['san-antonio-tx','allen-tx','stargate-tx','coreweave-plano','cipher-odessa'],
  },
  // ─── MISO: Midwest + South ────────────────────────────────────────────────
  {
    iso: 'MISO-IL-MN',
    query: 'MISO Illinois Minnesota "interconnection" "data center" megawatt ComEd Aurora Chicago Eagan',
    mustContain: ['miso','illinois','minnesota'],
    siteHints: ['aurora-il','dekalb-il','eagan-mn'],
  },
  {
    iso: 'MISO-IA-WI-IN',
    query: 'MISO Iowa Wisconsin Indiana "interconnection" "data center" megawatt Waukee MidAmerican',
    mustContain: ['miso','iowa','wisconsin','indiana'],
    siteHints: ['waukee-ia','microsoft-racine','indianapolis-in'],
  },
  {
    iso: 'MISO-MO',
    query: 'MISO Missouri "Kansas City" OR "St. Louis" "data center" megawatt "interconnection"',
    mustContain: ['miso','missouri','kansas city','st. louis','stlouis'],
    siteHints: ['kansas-city-mo','stlouis-mo'],
  },
  {
    iso: 'MISO-South',
    query: 'MISO TVA Tennessee Alabama Louisiana Memphis "data center" megawatt "interconnection"',
    mustContain: ['miso','tva','tennessee','alabama','louisiana','memphis'],
    siteHints: ['memphis-tn','clarksville-tn','smyrna-tn','huntsville-al','meta-louisiana','xai-memphis'],
  },
  // ─── SPP: Southwest Power Pool ────────────────────────────────────────────
  {
    iso: 'SPP-OK',
    query: 'SPP "Southwest Power Pool" Oklahoma "data center" megawatt "interconnection" OG&E PSO Pryor',
    mustContain: ['spp','oklahoma','pryor','tulsa'],
    siteHints: ['oklahoma-city-ok','google-mayes-ok'],
  },
  {
    iso: 'SPP-WY-CO',
    query: 'SPP Wyoming Colorado "data center" megawatt "interconnection" Xcel Cheyenne',
    mustContain: ['spp','wyoming','colorado','xcel','cheyenne'],
    siteHints: ['cheyenne-wy','denver-co','edgecore-aurora'],
  },
  // ─── NYISO: New York ──────────────────────────────────────────────────────
  {
    iso: 'NYISO',
    query: 'NYISO "New York" Plattsburgh NYPA "data center" megawatt hydro "interconnection queue"',
    mustContain: ['nyiso','plattsburgh','nypa','new york'],
    siteHints: ['plattsburgh-ny'],
  },
  // ─── ISO-NE: New England ──────────────────────────────────────────────────
  {
    iso: 'ISO-NE',
    query: '"ISO New England" OR "ISO-NE" Massachusetts "data center" megawatt "Brayton Point" "interconnection"',
    mustContain: ['iso new england','iso-ne','massachusetts','brayton'],
    siteHints: ['brayton-point-ma'],
  },
  // ─── WECC / Western Interconnect ──────────────────────────────────────────
  {
    iso: 'WECC-PNW',
    query: 'WECC BPA "Northwest Power" Washington Oregon "data center" megawatt Quincy Umatilla Hillsboro',
    mustContain: ['wecc','bpa','washington','oregon'],
    siteHints: ['george-wa','quincy-wa','sabey-quincy','umatilla-or','hillsboro-or','seattle-wa'],
  },
  {
    iso: 'WECC-NV-AZ',
    query: 'WECC "NV Energy" APS SRP Nevada Arizona "data center" megawatt "interconnection" Phoenix Henderson',
    mustContain: ['wecc','nevada','arizona','nv energy','aps','srp'],
    siteHints: ['reno-nv','henderson-nv','phoenix-mesa-az','goodyear-az','tucson-az','aligned-chandler-az','navajo-gs-az'],
  },
  {
    iso: 'WECC-UT-ID',
    query: 'WECC "Rocky Mountain Power" Utah Idaho "data center" megawatt Bluffdale Lehi Boise "interconnection"',
    mustContain: ['wecc','utah','idaho'],
    siteHints: ['bluffdale-ut','lehi-ut','novva-utah','boise-id'],
  },
  {
    iso: 'WECC-CO-WY',
    query: 'WECC Xcel "Public Service" Colorado Wyoming "data center" megawatt Denver Cheyenne "interconnection"',
    mustContain: ['wecc','xcel','colorado','wyoming'],
    siteHints: ['denver-co','edgecore-aurora','cheyenne-wy'],
  },
  // ─── Vertically-Integrated Utilities ─────────────────────────────────────
  {
    iso: 'Dominion',
    query: 'Dominion Energy Virginia "transmission" OR "interconnection" OR "grid" "data center" megawatt Ashburn Loudoun',
    mustContain: ['dominion','virginia','ashburn','loudoun'],
    siteHints: ['loudoun-va','pwc-va','stafford-va','richmond-va','iron-mountain-nova'],
  },
  {
    iso: 'Duke-SE',
    query: 'Duke Energy "North Carolina" Georgia RTP Atlanta "data center" megawatt "interconnection" OR "grid"',
    mustContain: ['duke','carolina','georgia','rtp','atlanta'],
    siteHints: ['rtp-nc','atlanta-douglas-ga'],
  },
  {
    iso: 'TVA',
    query: 'TVA "Tennessee Valley" Tennessee Alabama "data center" megawatt Memphis Clarksville Huntsville',
    mustContain: ['tva','tennessee valley','tennessee','alabama'],
    siteHints: ['memphis-tn','clarksville-tn','smyrna-tn','huntsville-al','xai-memphis'],
  },
  {
    iso: 'Xcel-MN',
    query: 'Xcel Energy Minnesota "data center" megawatt "interconnection" Minneapolis Eagan',
    mustContain: ['xcel','minnesota','minneapolis','eagan'],
    siteHints: ['eagan-mn'],
  },
  {
    iso: 'Florida-Grid',
    query: 'FPL OR "Florida Power" Florida "data center" megawatt "interconnection" Miami Doral',
    mustContain: ['fpl','florida power','florida','miami'],
    siteHints: ['miami-fl'],
  },
  // ─── Broad / Catch-all ────────────────────────────────────────────────────
  {
    iso: 'US-LargeLoad',
    query: '"large load" "data center" OR "hyperscale" "interconnection" gigawatt utility 2025',
    mustContain: ['large load','data center','interconnection'],
    siteHints: [],
  },
  {
    iso: 'US-FERC-DC',
    query: 'FERC "data center" "interconnection" OR "transmission" gigawatt megawatt approved order 2025',
    mustContain: ['ferc','data center','interconnection'],
    siteHints: [],
  },
  // ─── Canada ───────────────────────────────────────────────────────────────
  {
    iso: 'IESO-ON',
    query: 'IESO Ontario Toronto Markham "data center" megawatt "grid connection" OR "interconnection"',
    mustContain: ['ieso','ontario','toronto','markham'],
    siteHints: ['toronto-on'],
  },
  {
    iso: 'BCHydro',
    query: '"BC Hydro" OR "British Columbia Hydro" Vancouver Surrey "data center" megawatt "grid connection"',
    mustContain: ['bc hydro','british columbia','vancouver','surrey'],
    siteHints: ['vancouver-bc'],
  },
  {
    iso: 'HydroQC',
    query: '"Hydro-Québec" OR "Hydro Quebec" Montreal Vaudreuil "data center" megawatt "interconnection"',
    mustContain: ['hydro-québec','hydro quebec','montreal','vaudreuil','quebec'],
    siteHints: ['montreal-qc'],
  },
];

// Static RSS feeds with official interconnection/grid news
const STATIC_FEEDS: Array<{ url: string; label: string }> = [
  { url: FERC_RSS,  label: 'FERC' },
  { url: DOE_RSS,   label: 'DOE' },
  // PJM News
  { url: 'https://www.pjm.com/rss/news.aspx', label: 'PJM' },
  // ERCOT News (try standard WordPress RSS pattern)
  { url: 'https://www.ercot.com/feed', label: 'ERCOT' },
];

interface NewsItem { title: string; link: string; pubDate: string; description: string }

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g) || [];
  for (const b of blocks) {
    const title   = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)     || [])[1]?.replace(/<[^>]+>/g,'').trim() || '';
    const link    = (b.match(/<link[^>]*>([\s\S]*?)<\/link>/)                             || [])[1]?.trim()
                 || (b.match(/<link[^>]*href="([^"]+)"/)                                  || [])[1]?.trim() || '';
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)                            || [])[1]?.trim()
                 || (b.match(/<published>([\s\S]*?)<\/published>/)                        || [])[1]?.trim() || '';
    const desc    = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.replace(/<[^>]+>/g,'').trim() || '';
    if (title) items.push({ title, link, pubDate, description: desc });
  }
  return items;
}

function scoreItem(text: string): number {
  const low = text.toLowerCase();
  return HIGH_VALUE_TERMS.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
}

function parseDate(raw: string): string {
  try { return new Date(raw).toISOString().slice(0, 10); }
  catch { return new Date().toISOString().slice(0, 10); }
}

async function fetchWithTimeout(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DC-Tracker/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function runIsoQueues(sites: SiteStub[]): Promise<RawSignal[]> {
  const siteMap  = new Map(sites.map(s => [s.id, s]));
  const index    = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen     = new Set<string>();

  // ── Part 1: ISO-specific Google News RSS queries ───────────────────────────
  for (const { iso, query, mustContain, siteHints } of ISO_QUERIES) {
    let xml = '';
    try {
      const url = `${GNEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      xml = await fetchWithTimeout(url);
      await new Promise(r => setTimeout(r, 150));
    } catch { continue; }

    const items = parseRSS(xml);
    const directSites = siteHints.filter(id => siteMap.has(id));

    for (const item of items.slice(0, 12)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;

      const fullText = (item.title + ' ' + item.description).toLowerCase();
      const locationMatch = mustContain.length === 0 || mustContain.some(kw => fullText.includes(kw));
      if (!locationMatch) continue;

      seen.add(dedupKey);
      const score = scoreItem(fullText);
      if (score < 2) continue;

      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `[${iso}] Grid Queue: ${cleanTitle}`;
      const date = parseDate(item.pubDate);
      const confidence = score >= 4 ? 'high' : 'medium';

      // Use deterministic siteHints when available, else fall back to text match
      const targetSites = directSites.length > 0
        ? directSites
        : matchText(item.title + ' ' + item.description, index, 2);

      for (const siteId of targetSites) {
        signals.push({
          siteId,
          type: 'interconnection_request',
          date,
          description,
          sourceUrl: item.link || undefined,
          confidence: confidence as 'high' | 'medium',
        });
      }
    }
  }

  // ── Part 2: Official grid-operator RSS feeds ───────────────────────────────
  const feedResults = await Promise.allSettled(
    STATIC_FEEDS.map(f => fetchWithTimeout(f.url).then(xml => ({ xml, label: f.label })))
  );

  for (const result of feedResults) {
    if (result.status === 'rejected') continue;
    const { xml, label } = result.value;
    const items = parseRSS(xml);

    for (const item of items.slice(0, 20)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;

      const fullText = (item.title + ' ' + item.description).toLowerCase();
      const score = scoreItem(fullText);
      if (score < 3) continue; // higher bar for RSS feeds — more noise

      const matched = matchText(item.title + ' ' + item.description, index, 2);
      if (matched.length === 0) continue;

      seen.add(dedupKey);
      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `[${label}] ${cleanTitle}`;
      const date = parseDate(item.pubDate);

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'interconnection_request',
          date,
          description,
          sourceUrl: item.link || undefined,
          confidence: score >= 5 ? 'high' : 'medium',
        });
      }
    }
  }

  return signals;
}
