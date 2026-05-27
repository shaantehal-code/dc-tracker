import type { SiteStub } from './types';

// Company names and geographic terms that appear across many sites — too generic to discriminate
const STOP_WORDS = new Set([
  // Generic DC terms
  'data','center','centres','centers','campus','digital','cloud','tech','technology',
  'power','energy','electric','grid','park','zone','county','city','metro','north',
  'south','east','west','corp','inc','llc','ltd','group','holdings','realty','trust',
  'phase','project','campus','facility','facilities','site','sites','national','america',
  'american','global','international','infrastructure','network','networks','system',
  'systems','services','management','development','construction','building','buildings',
  // US/international geographic adjectives that leak from tags/notes into false matches
  'florida','texas','virginia','ohio','california','georgia','nevada','arizona','utah',
  'oregon','washington','colorado','minnesota','illinois','tennessee','indiana','iowa',
  'carolina','wyoming','pennsylvania','massachusetts','missouri','wisconsin','jersey',
  'latam','gateway','cable','cables','hub','hubs','risk','zone','corridor','region',
  'hurricane','nuclear','renewable','solar','wind','hydro','atomic',
  'largest','fastest','growing','biggest','major','main','primary','leading',
  // Geographic region names (too generic)
  'southeast','southwest','northeast','northwest','midwest','apac','emea','mena',
  'americas','pacific','atlantic','continent','continental',
  // Major telecos present in many sites/articles
  'verizon','comcast','sprint','tmobile','centurylink','lumen',
  // Mega-operators present in 10+ sites — too generic for location discrimination
  // (these are matched via CIK in SEC EDGAR instead)
  'equinix','amazon','google','alphabet','microsoft','nvidia','meta','facebook',
  'ntt','ironmountain','digitalrealty','vantage','cyrusone','coresite','cologix',
]);

function tokenize(text: string): string[] {
  return (text.match(/[A-Za-z]{3,}/g) || [])
    .map(w => w.toLowerCase())
    .filter(w => !STOP_WORDS.has(w));
}

// Index: token → set of site IDs
type Index = Map<string, Set<string>>;

export function buildSiteIndex(sites: SiteStub[]): Index {
  const index: Index = new Map();

  function add(token: string, siteId: string) {
    const t = token.toLowerCase().trim();
    if (t.length < 3 || STOP_WORDS.has(t)) return;
    if (!index.has(t)) index.set(t, new Set());
    index.get(t)!.add(siteId);
  }

  for (const s of sites) {
    // Location (highest signal)
    add(s.city, s.id);
    if (s.state) { add(s.state, s.id); add(s.state.toLowerCase(), s.id); }
    add(s.country, s.id);
    add(s.region, s.id);

    // Name fragments
    for (const w of tokenize(s.name)) add(w, s.id);

    // Owner names
    if (s.owner) {
      for (const w of tokenize(s.owner)) add(w, s.id);
      // Also index multi-word company names: "Digital Realty" → "digitalrealty"
      const compressed = s.owner.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');
      if (compressed.length > 4) add(compressed, s.id);
    }

    // Tags — index the compressed whole tag (not split parts, to avoid generic token pollution)
    for (const tag of s.tags) {
      const compressed = tag.replace(/_/g, '');
      if (compressed.length >= 6) add(compressed, s.id);
    }

    // Specific proper nouns from notes (8+ chars, capitalized, not a stop word)
    // Long requirement filters out generic English words like Sunrise, Strong, Trade, etc.
    const properNouns = s.notes.match(/\b[A-Z][a-z]{7,}\b/g) || [];
    for (const noun of properNouns.slice(0, 20)) add(noun, s.id);
  }

  return index;
}

export function matchText(text: string, index: Index, maxResults = 3): string[] {
  const scores = new Map<string, number>();
  const discriminating = new Set<string>(); // sites that matched a rare (≤3 sites) token
  const tokens = tokenize(text);

  for (const token of tokens) {
    const hits = index.get(token);
    if (!hits) continue;
    // Rare tokens (few sites match) score higher and mark as discriminating
    const weight = hits.size <= 2 ? 4 : hits.size <= 5 ? 2 : 1;
    hits.forEach(siteId => {
      scores.set(siteId, (scores.get(siteId) || 0) + weight);
      if (hits.size <= 3) discriminating.add(siteId);
    });
  }

  const entries: [string, number][] = [];
  scores.forEach((score, id) => {
    // Require score ≥ 4 AND at least one discriminating (rare) token match
    if (score >= 4 && discriminating.has(id)) entries.push([id, score]);
  });
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([id]) => id);
}
