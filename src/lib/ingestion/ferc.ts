/**
 * Power Grid & Interconnection intelligence source.
 * Runs targeted Google News RSS queries per US state/region to find
 * PPA deals, nuclear agreements, grid interconnection events.
 * Site-specific queries instead of generic matching — higher precision.
 */
import type { RawSignal, SiteStub } from './types';

const GNEWS_RSS = 'https://news.google.com/rss/search';

// US state/region → targeted power query with mustContain location validation
const REGION_QUERIES: Array<{ location: string; query: string; mustContain: string[]; siteHints: string[] }> = [
  { location: 'Virginia',      query: 'Virginia "data center" power megawatt utility Dominion',          mustContain: ['virginia','dominion','ashburn','loudoun'],       siteHints: ['loudoun-va','pwc-va','stafford-va','richmond-va','iron-mountain-nova'] },
  { location: 'Ohio',          query: 'Ohio "data center" power megawatt AEP FirstEnergy',               mustContain: ['ohio','aep','firstenergy','columbus'],           siteHints: ['new-albany-oh','killen-oh'] },
  { location: 'Texas',         query: 'Texas "data center" power megawatt ERCOT CPS interconnection',    mustContain: ['texas','ercot','cps','oncor'],                   siteHints: ['san-antonio-tx','allen-tx','stargate-tx','coreweave-plano','cipher-odessa'] },
  { location: 'Pennsylvania',  query: 'Pennsylvania "data center" nuclear power megawatt PPL PECO',      mustContain: ['pennsylvania','ppl','peco','susquehanna'],        siteHints: ['homer-city-pa','nuclear-berwick-pa','talen-nuclear-pa'] },
  { location: 'Nevada',        query: 'Nevada OR "Las Vegas" "data center" power megawatt NV Energy',    mustContain: ['nevada','las vegas','nv energy','reno'],          siteHints: ['henderson-nv','reno-nv'] },
  { location: 'Washington',    query: 'Washington OR Quincy OR Wenatchee "data center" power BPA',       mustContain: ['washington','quincy','wenatchee','bpa','seattle'], siteHints: ['george-wa','quincy-wa','sabey-quincy','seattle-wa'] },
  { location: 'Arizona',       query: 'Arizona OR Phoenix "data center" power megawatt APS SRP',         mustContain: ['arizona','phoenix','chandler','aps','srp'],       siteHints: ['phoenix-mesa-az','goodyear-az','tucson-az','aligned-chandler-az','navajo-gs-az'] },
  { location: 'Utah',          query: 'Utah "data center" power megawatt Rocky Mountain Power',          mustContain: ['utah','bluffdale','lehi'],                       siteHints: ['bluffdale-ut','lehi-ut','novva-utah'] },
  { location: 'Oregon',        query: 'Oregon OR Portland "data center" power BPA hydro megawatt',       mustContain: ['oregon','portland','hillsboro','umatilla'],       siteHints: ['umatilla-or','hillsboro-or'] },
  { location: 'Tennessee',     query: 'Tennessee OR Memphis "data center" power megawatt TVA',           mustContain: ['tennessee','memphis','clarksville','tva'],        siteHints: ['memphis-tn','clarksville-tn','smyrna-tn','xai-memphis'] },
  { location: 'Iowa',          query: 'Iowa "data center" power megawatt MidAmerican Energy',            mustContain: ['iowa','waukee','midamerican'],                   siteHints: ['waukee-ia'] },
  { location: 'Wyoming',       query: 'Wyoming OR Cheyenne "data center" power megawatt Xcel',           mustContain: ['wyoming','cheyenne'],                           siteHints: ['cheyenne-wy'] },
  { location: 'Georgia',       query: 'Georgia OR Atlanta "data center" power megawatt Georgia Power',   mustContain: ['georgia','atlanta'],                            siteHints: ['atlanta-douglas-ga'] },
  { location: 'NorthCarolina', query: '"Research Triangle" OR "RTP" "data center" power Duke Energy',    mustContain: ['rtp','research triangle','carolina','duke energy'],siteHints: ['rtp-nc'] },
  { location: 'NewJersey',     query: '"New Jersey" OR Secaucus OR Parsippany "data center" power',      mustContain: ['jersey','secaucus','parsippany'],                siteHints: ['secaucus-nj'] },
  { location: 'Florida',       query: 'Miami OR Florida "data center" power megawatt FPL',               mustContain: ['miami','florida','fpl'],                         siteHints: ['miami-fl'] },
  // Additional US states
  { location: 'Illinois',      query: 'Illinois OR Chicago OR Aurora "data center" power megawatt ComEd', mustContain: ['illinois','chicago','aurora','comed'],          siteHints: ['aurora-il','dekalb-il'] },
  { location: 'Colorado',      query: 'Colorado OR Denver "data center" power megawatt Xcel Energy',      mustContain: ['colorado','denver','aurora'],                   siteHints: ['denver-co','edgecore-aurora'] },
  { location: 'Minnesota',     query: 'Minnesota OR Minneapolis "data center" power megawatt Xcel',       mustContain: ['minnesota','minneapolis','eagan','xcel'],        siteHints: ['eagan-mn'] },
  { location: 'Oklahoma',      query: 'Oklahoma OR Tulsa "data center" power megawatt OG&E PSO',          mustContain: ['oklahoma','tulsa','pryor'],                      siteHints: ['google-mayes-ok','oklahoma-city-ok'] },
  { location: 'Alabama',       query: 'Alabama OR Huntsville "data center" power megawatt TVA',           mustContain: ['alabama','huntsville'],                         siteHints: ['huntsville-al'] },
  { location: 'Indiana',       query: 'Indiana OR Indianapolis "data center" power megawatt Duke',        mustContain: ['indiana','indianapolis'],                       siteHints: ['indianapolis-in'] },
  { location: 'Missouri',      query: 'Missouri OR "Kansas City" OR "St. Louis" "data center" power',     mustContain: ['missouri','kansas city','st. louis','stlouis'],  siteHints: ['kansas-city-mo','stlouis-mo'] },
  { location: 'Wisconsin',     query: 'Wisconsin OR Racine OR Milwaukee "data center" power megawatt',    mustContain: ['wisconsin','racine','milwaukee'],                siteHints: ['microsoft-racine'] },
  { location: 'WestVirginia',  query: '"West Virginia" OR Moorefield "data center" power megawatt',       mustContain: ['west virginia','moorefield'],                   siteHints: ['monarch-wv'] },
  { location: 'Louisiana',     query: 'Louisiana OR "Richland Parish" "data center" power megawatt',      mustContain: ['louisiana','richland'],                         siteHints: ['meta-louisiana'] },
  { location: 'NewYork',       query: '"New York" OR Plattsburgh "data center" power NYPA hydro',         mustContain: ['plattsburgh','new york','nypa'],                 siteHints: ['plattsburgh-ny'] },
  { location: 'Idaho',         query: 'Idaho OR Boise "data center" power megawatt Idaho Power',          mustContain: ['idaho','boise'],                                siteHints: ['boise-id'] },
  { location: 'Massachusetts', query: 'Massachusetts OR "Brayton Point" OR Boston "data center" power',   mustContain: ['massachusetts','brayton','boston'],              siteHints: ['brayton-point-ma'] },
];

const HIGH_VALUE_TERMS = ['megawatt','gigawatt','mw','gw','ppa','interconnection','transmission','campus','utility','offtake','reactor','smr','nuclear','power','substation'];

interface GNewsItem { title: string; link: string; pubDate: string; description: string }

function parseGNewsRSS(xml: string): GNewsItem[] {
  const items: GNewsItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const b of blocks) {
    const title = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim() || '';
    const link  = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || '';
    const pubDate = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]?.trim() || '';
    const desc = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.trim() || '';
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

export async function runFerc(sites: SiteStub[]): Promise<RawSignal[]> {
  const siteMap = new Map(sites.map(s => [s.id, s]));
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const { query, mustContain, siteHints } of REGION_QUERIES) {
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

      // Require at least one location keyword in the article text
      const fullText = (item.title + ' ' + item.description).toLowerCase();
      const locationMatch = mustContain.some(kw => fullText.includes(kw.toLowerCase()));
      if (!locationMatch) continue;

      seen.add(dedupKey);

      const score = scoreItem(item.title, item.description);
      if (score < 2) continue;

      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `Power Grid: ${cleanTitle}`;
      const date = parseDate(item.pubDate);

      for (const siteId of targetSites) {
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
