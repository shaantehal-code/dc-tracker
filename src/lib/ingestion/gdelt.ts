/**
 * Global DC Expansion intelligence source.
 * Runs city/region-specific Google News RSS queries for each tracked market.
 * Deterministic site assignment via query-to-site-hint mapping — no fuzzy matching.
 */
import type { RawSignal, SiteStub } from './types';

const GNEWS_RSS = 'https://news.google.com/rss/search';

// Each entry: query targets Google News, mustContain is validated against article text, siteHints gets the signal
const CITY_QUERIES: Array<{ query: string; mustContain: string[]; siteHints: string[] }> = [
  // US markets
  { query: 'Miami OR "NAP Americas" "data center" megawatt campus announced',              mustContain: ['miami','nap','florida'],      siteHints: ['miami-fl'] },
  { query: 'Seattle OR "Puget Sound" "data center" hyperscale campus megawatt',            mustContain: ['seattle','puget'],            siteHints: ['seattle-wa'] },
  { query: '"New Jersey" OR Secaucus OR Parsippany "data center" campus hyperscale',       mustContain: ['jersey','secaucus','parsippany'], siteHints: ['secaucus-nj'] },
  // APAC
  { query: 'Singapore "data center" megawatt campus construction announced',               mustContain: ['singapore'],                   siteHints: ['singapore-sg','batam-id'] },
  { query: 'Tokyo OR Inzai OR Japan "data center" megawatt campus hyperscale',             mustContain: ['tokyo','japan','inzai'],       siteHints: ['inzai-jp'] },
  { query: 'Osaka OR Sakai Japan "data center" megawatt campus AWS',                       mustContain: ['osaka','sakai','japan'],       siteHints: ['osaka-jp'] },
  { query: 'Seoul OR Korea OR Incheon "data center" hyperscale megawatt KT SKT',           mustContain: ['seoul','korea','incheon'],     siteHints: ['hanam-kr'] },
  { query: 'Sydney OR "Eastern Creek" Australia "data center" hyperscale megawatt',        mustContain: ['sydney','australia'],          siteHints: ['sydney-au'] },
  { query: 'Melbourne Australia "data center" campus hyperscale announced',                mustContain: ['melbourne','australia'],       siteHints: ['sydney-au'] },
  { query: '"Johor Bahru" OR "Iskandar" OR Malaysia "data center" megawatt hyperscale',    mustContain: ['johor','iskandar','malaysia'],  siteHints: ['johor-my'] },
  { query: 'Batam Indonesia "data center" megawatt construction',                          mustContain: ['batam','indonesia'],           siteHints: ['batam-id'] },
  { query: 'Jakarta OR Bekasi Indonesia "data center" megawatt hyperscale',                mustContain: ['jakarta','bekasi','indonesia'],siteHints: ['jakarta-id'] },
  { query: 'Bangkok OR Thailand "data center" megawatt campus hyperscale',                 mustContain: ['bangkok','thailand'],          siteHints: ['bangkok-th'] },
  { query: 'Manila OR Philippines "data center" megawatt campus PLDT Globe',               mustContain: ['manila','philippines'],        siteHints: ['manila-ph'] },
  { query: '"Ho Chi Minh" OR Vietnam "data center" megawatt campus announced',             mustContain: ['vietnam','chiminh','ho chi'],  siteHints: ['hcmc-vn'] },
  { query: 'Mumbai OR "Navi Mumbai" India "data center" megawatt hyperscale',              mustContain: ['mumbai','india'],              siteHints: ['navi-mumbai-in'] },
  { query: 'Bangalore OR Bengaluru India "data center" megawatt hyperscale',               mustContain: ['bangalore','bengaluru','india'],siteHints: ['bangalore-in'] },
  { query: 'Hyderabad India "data center" hyperscale megawatt construction',               mustContain: ['hyderabad','india'],           siteHints: ['hyderabad-in'] },
  // Europe
  { query: 'Amsterdam OR Netherlands "data center" megawatt campus hyperscale',            mustContain: ['amsterdam','netherlands'],     siteHints: ['amsterdam-nl','zeewolde-nl'] },
  { query: 'London OR Slough OR "UK data center" megawatt campus hyperscale',              mustContain: ['london','slough','uk'],        siteHints: ['london-uk'] },
  { query: 'Paris OR France "data center" megawatt campus EDF announced',                  mustContain: ['paris','france'],              siteHints: ['paris-fr'] },
  { query: 'Frankfurt OR Germany "data center" megawatt campus hyperscale',                mustContain: ['frankfurt','germany'],         siteHints: ['frankfurt-de','magdeburg-de'] },
  { query: 'Madrid OR Spain "data center" megawatt campus announced',                      mustContain: ['madrid','spain'],              siteHints: ['madrid-es'] },
  { query: 'Stockholm OR Sweden "data center" megawatt campus hyperscale',                 mustContain: ['stockholm','sweden'],          siteHints: ['stockholm-se'] },
  { query: 'Oslo OR Norway "data center" megawatt hydro campus',                           mustContain: ['oslo','norway'],               siteHints: ['oslo-no'] },
  { query: 'Zurich OR Switzerland "data center" megawatt campus',                          mustContain: ['zurich','switzerland'],        siteHints: ['zurich-ch'] },
  { query: 'Warsaw OR Poland "data center" megawatt campus hyperscale',                    mustContain: ['warsaw','poland'],             siteHints: ['warsaw-pl'] },
  { query: 'Milan OR Italy "data center" megawatt campus Aruba hyperscale',                mustContain: ['milan','italy'],               siteHints: ['milan-it'] },
  { query: 'Marseille "data center" megawatt subsea cable',                                mustContain: ['marseille'],                   siteHints: ['marseille-fr'] },
  { query: 'Dublin OR Ireland "data center" megawatt campus hyperscale',                   mustContain: ['dublin','ireland'],            siteHints: ['dublin-ie','athenry-ie'] },
  // Middle East
  { query: 'Dubai OR UAE "data center" megawatt campus hyperscale announced',              mustContain: ['dubai','uae'],                siteHints: ['dubai-uae','abu-dhabi-uae'] },
  { query: '"Abu Dhabi" OR "Masdar City" "data center" megawatt campus G42',               mustContain: ['abu dhabi','masdar'],         siteHints: ['abu-dhabi-uae'] },
  { query: 'Riyadh OR "Saudi Arabia" "data center" megawatt NEOM hyperscale',              mustContain: ['riyadh','saudi'],             siteHints: ['riyadh-sa'] },
  { query: '"Tel Aviv" OR Israel "data center" megawatt campus',                           mustContain: ['tel aviv','israel'],          siteHints: ['tel-aviv-il'] },
  // Africa
  { query: 'Johannesburg OR "South Africa" "data center" megawatt Teraco',                 mustContain: ['johannesburg','south africa'], siteHints: ['johannesburg-za'] },
  { query: '"Cape Town" "data center" megawatt campus cables',                             mustContain: ['cape town'],                  siteHints: ['cape-town-za'] },
  { query: 'Nairobi OR Kenya "data center" megawatt campus hyperscale',                    mustContain: ['nairobi','kenya'],            siteHints: ['nairobi-ke'] },
  { query: 'Lagos OR Nigeria "data center" megawatt campus hyperscale',                    mustContain: ['lagos','nigeria'],            siteHints: ['lagos-ng'] },
  { query: 'Cairo OR Egypt "data center" megawatt campus hyperscale',                      mustContain: ['cairo','egypt'],              siteHints: ['cairo-eg'] },
  // Latin America
  { query: '"São Paulo" OR "Sao Paulo" OR Brazil "data center" megawatt campus',           mustContain: ['paulo','brazil'],             siteHints: ['sao-paulo-br'] },
  { query: 'Santiago OR Chile "data center" megawatt campus hyperscale',                   mustContain: ['santiago','chile'],           siteHints: ['santiago-chile'] },
  { query: 'Querétaro OR Mexico "data center" megawatt campus',                            mustContain: ['queretaro','mexico'],         siteHints: ['queretaro-mx'] },
  { query: 'Bogotá OR Colombia "data center" megawatt campus hyperscale',                  mustContain: ['bogota','colombia'],          siteHints: ['bogota-co'] },
  // Canada
  { query: 'Montreal OR "Vaudreuil" OR Quebec "data center" megawatt hyperscale campus',  mustContain: ['montreal','quebec','vaudreuil'],siteHints: ['montreal-qc'] },
  { query: 'Toronto OR Markham OR Ontario "data center" megawatt hyperscale campus',      mustContain: ['toronto','markham','ontario'],  siteHints: ['toronto-on'] },
  { query: 'Vancouver OR Surrey OR "British Columbia" "data center" megawatt hyperscale', mustContain: ['vancouver','surrey','columbia'], siteHints: ['vancouver-bc'] },
  // Northern/Eastern Europe (uncovered markets)
  { query: 'Reykjavik OR Iceland "data center" megawatt geothermal campus hyperscale',    mustContain: ['reykjavik','iceland'],          siteHints: ['reykjavik-is'] },
  { query: 'Helsinki OR Kouvola OR Finland "data center" megawatt campus hyperscale',     mustContain: ['helsinki','kouvola','finland'],  siteHints: ['kouvola-fi'] },
  { query: 'Eskilstuna OR Mälardalen OR "Vasteras" Sweden "data center" megawatt campus', mustContain: ['eskilstuna','vasteras','sweden'], siteHints: ['eskilstuna-se'] },
  { query: 'Sines OR Lisbon OR Portugal "data center" megawatt subsea campus',            mustContain: ['sines','lisbon','portugal'],    siteHints: ['sines-pt'] },
  { query: 'Bucharest OR Romania "data center" megawatt campus hyperscale',               mustContain: ['bucharest','romania'],          siteHints: ['bucharest-ro'] },
];

const HIGH_VALUE_TERMS = ['megawatt','gigawatt','mw','gw','hyperscale','campus','construction','groundbreaking','billion','announced','expansion','investment'];

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

export async function runGdelt(sites: SiteStub[]): Promise<RawSignal[]> {
  const siteMap = new Map(sites.map(s => [s.id, s]));
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  for (const { query, mustContain, siteHints } of CITY_QUERIES) {
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

    for (const item of items.slice(0, 10)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;

      // Require at least one mustContain keyword to appear in title+description
      const fullText = (item.title + ' ' + item.description).toLowerCase();
      const locationMatch = mustContain.some(kw => fullText.includes(kw.toLowerCase()));
      if (!locationMatch) continue;

      seen.add(dedupKey);

      const score = scoreItem(item.title, item.description);
      const cleanTitle = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
      const description = `Global Intel: ${cleanTitle}`;
      const date = parseDate(item.pubDate);

      for (const siteId of targetSites) {
        signals.push({
          siteId,
          type: 'news',
          date,
          description,
          sourceUrl: item.link || undefined,
          confidence: score >= 3 ? 'high' : 'medium',
        });
      }
    }
  }

  return signals;
}
