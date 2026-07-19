/**
 * Hyperscaler & DC company earnings / investor day monitor.
 * Queries Google News RSS for capacity announcements made on earnings calls —
 * specific MW/GW figures are typically a 1–3 year leading indicator of new campuses.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';
import { yearHint } from './util';

const GNEWS_RSS = 'https://news.google.com/rss/search';

// Built at ingestion time so the recency hint (${yh}) always tracks the calendar.
function buildEarningsQueries(): { query: string; label: string }[] {
  const yh = yearHint();
  return [
    // Hyperscaler earnings with DC capacity mentions
    { query: `Microsoft Azure "data center" megawatt OR gigawatt earnings OR "investor day" OR campus ${yh}`, label: 'MSFT' },
    { query: `Amazon AWS "data center" megawatt OR gigawatt earnings OR "capital expenditure" campus ${yh}`, label: 'AMZN' },
    { query: `Google Alphabet "data center" megawatt OR gigawatt earnings OR capex campus ${yh}`, label: 'GOOGL' },
    { query: `Meta "data center" megawatt OR gigawatt earnings OR "capital expenditure" campus ${yh}`, label: 'META' },
    { query: `Nvidia "data center" megawatt OR gigawatt capacity earnings ${yh}`, label: 'NVDA' },
    { query: `CoreWeave "data center" megawatt OR gigawatt earnings OR investment campus ${yh}`, label: 'CRWV' },
    { query: `"Applied Digital" "data center" megawatt OR gigawatt campus earnings ${yh}`, label: 'APLD' },
    { query: `xAI "Grok" OR "Colossus" "data center" megawatt OR gigawatt campus expansion ${yh}`, label: 'xAI' },
    // DC REITs / operators
    { query: `Equinix "data center" megawatt campus expansion earnings acquisition ${yh}`, label: 'EQIX' },
    { query: `"Digital Realty" "data center" megawatt campus expansion earnings ${yh}`, label: 'DLR' },
    { query: `"Iron Mountain" "data center" megawatt campus expansion earnings ${yh}`, label: 'IRM' },
    { query: `"Vantage Data Centers" megawatt OR gigawatt campus expansion investment ${yh}`, label: 'Vantage' },
    { query: `QTS OR "QTS Realty" "data center" megawatt campus expansion ${yh}`, label: 'QTS' },
    { query: `"Aligned Data Centers" megawatt OR gigawatt campus expansion ${yh}`, label: 'Aligned' },
    { query: `Switch OR EdgeConneX "data center" megawatt campus expansion ${yh}`, label: 'Switch/Edge' },
    { query: `"Stack Infrastructure" data center megawatt campus expansion ${yh}`, label: 'Stack' },
    { query: `Brookfield OR DigitalBridge "data center" megawatt OR gigawatt investment platform ${yh}`, label: 'Investors' },
    { query: `Vertiv "data center" megawatt OR gigawatt orders backlog AI ${yh}`, label: 'VRT' },
    // AI infrastructure announcements
    { query: `"Project Stargate" OR "Stargate AI" "data center" megawatt OR gigawatt campus ${yh}`, label: 'Stargate' },
    { query: `"AI campus" OR "AI factory" megawatt OR gigawatt construction investment ${yh}`, label: 'AI-Campus' },
    { query: `Oracle OCI OR Stargate "data center" megawatt OR gigawatt cloud region expansion ${yh}`, label: 'ORCL' },
    { query: `OpenAI "data center" OR "compute" gigawatt Stargate OR campus buildout ${yh}`, label: 'OpenAI' },
    { query: `Anthropic "data center" OR compute cluster gigawatt OR megawatt capacity ${yh}`, label: 'Anthropic' },
    { query: `Crusoe "data center" megawatt OR gigawatt Abilene OR campus AI capacity ${yh}`, label: 'Crusoe' },
    { query: `Nebius "data center" megawatt OR gigawatt GPU capacity expansion ${yh}`, label: 'Nebius' },
    { query: `Lambda Labs "data center" GPU megawatt OR gigawatt capacity cluster ${yh}`, label: 'Lambda' },
    { query: `Nscale "data center" megawatt OR gigawatt GPU capacity Microsoft OR OpenAI ${yh}`, label: 'Nscale' },
    { query: `IREN OR TeraWulf "data center" OR HPC megawatt AI hosting ${yh}`, label: 'IREN/WULF' },
    { query: `"Together AI" OR Fluidstack OR "Together Computer" GPU data center megawatt ${yh}`, label: 'Neocloud2' },
    { query: `"neocloud" OR "GPU cloud" data center megawatt OR gigawatt capacity secured ${yh}`, label: 'Neocloud' },
    // Earnings transcript aggregators
    { query: `site:seekingalpha.com "data center" megawatt gigawatt earnings transcript ${yh}`, label: 'SeekingAlpha' },
  ];
}

const HIGH_VALUE_TERMS = [
  'megawatt', 'gigawatt', 'mw', 'gw', 'campus', 'hyperscale', 'capex',
  'capital expenditure', 'data center', 'expansion', 'construction',
  'investment', 'billion', 'announced', 'gigawatt',
];

interface GNewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseGNewsRSS(xml: string): GNewsItem[] {
  const items: GNewsItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const b of blocks) {
    const title    = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)            || [])[1]?.trim() || '';
    const link     = (b.match(/<link>([\s\S]*?)<\/link>/)                                         || [])[1]?.trim() || '';
    const pubDate  = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)                                   || [])[1]?.trim() || '';
    const desc     = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.trim() || '';
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

function cleanTitle(raw: string): string {
  // Strip trailing " - Source Name" attribution common in Google News titles
  return raw.replace(/\s+-\s+[^-]+$/, '').trim().slice(0, 180);
}

export async function runEarningsWatch(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();
  const EARNINGS_QUERIES = buildEarningsQueries();

  for (const { query, label } of EARNINGS_QUERIES) {
    let xml = '';
    try {
      const url = `${GNEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DC-Tracker-Intelligence/1.0 (contact@dctracker.io)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      xml = await res.text();
      await new Promise(r => setTimeout(r, 150));
    } catch { continue; }

    const items = parseGNewsRSS(xml);

    for (const item of items.slice(0, 10)) {
      const dedupKey = item.link || item.title.slice(0, 80);
      if (seen.has(dedupKey)) continue;

      const score = scoreItem(item.title, item.description);
      if (score < 2) continue;

      seen.add(dedupKey);

      const text = `${item.title} ${item.description}`;
      const matched = matchText(text, index);
      // Earnings signals are broad company-level; emit with a synthetic "global" site
      // if no specific site matches, but skip entirely if zero-match to avoid noise
      if (matched.length === 0) continue;

      const date = parseDate(item.pubDate);
      const description = `[${label}] Earnings: ${cleanTitle(item.title)}`;
      const confidence: 'high' | 'medium' = score >= 4 ? 'high' : 'medium';

      for (const siteId of matched) {
        signals.push({
          siteId,
          type: 'partner_announcement',
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
