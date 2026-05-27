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

    // Notable proper nouns from notes (≥5 chars, capitalized)
    const properNouns = s.notes.match(/\b[A-Z][a-z]{4,}\b/g) || [];
    for (const noun of properNouns.slice(0, 30)) add(noun, s.id);
  }

  return index;
}

export function matchText(text: string, index: Index, maxResults = 3): string[] {
  const scores = new Map<string, number>();
  const tokens = tokenize(text);

  for (const token of tokens) {
    const hits = index.get(token);
    if (!hits) continue;
    // Rare tokens (few sites match) score higher
    const weight = hits.size <= 2 ? 3 : hits.size <= 5 ? 2 : 1;
    hits.forEach(siteId => {
      scores.set(siteId, (scores.get(siteId) || 0) + weight);
    });
  }

  const entries: [string, number][] = [];
  scores.forEach((score, id) => { if (score >= 3) entries.push([id, score]); });
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([id]) => id);
}
