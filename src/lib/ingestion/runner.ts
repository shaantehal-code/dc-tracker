/**
 * Ingestion runner — orchestrates all data sources, deduplicates,
 * and writes new signals to the SQLite database.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { RawSignal, IngestionResult, SiteStub } from './types';
import { runSecEdgar } from './sec-edgar';
import { runNewsRss } from './news-rss';
import { runEia } from './eia';
import { runFerc } from './ferc';
import { runGdelt } from './gdelt';

export const SOURCES: Record<string, {
  label: string;
  desc: string;
  run: (sites: SiteStub[]) => Promise<RawSignal[]>;
}> = {
  sec_edgar: {
    label: 'SEC EDGAR',
    desc: '8-K / 10-K filings — 15+ tracked DC companies',
    run: runSecEdgar,
  },
  news_rss: {
    label: 'News & RSS',
    desc: 'DCD, The Register, DCFrontier, Bisnow, 4 more feeds',
    run: runNewsRss,
  },
  eia: {
    label: 'EIA Power Data',
    desc: 'Monthly US electricity retail prices (requires EIA_API_KEY)',
    run: runEia,
  },
  ferc: {
    label: 'FERC Filings',
    desc: 'Interconnection requests & transmission upgrades',
    run: runFerc,
  },
  gdelt: {
    label: 'GDELT Global News',
    desc: 'AI-monitored news from 100+ countries, updated every 15 min',
    run: runGdelt,
  },
};

function loadSites(db: DatabaseSync): SiteStub[] {
  const rows = db.prepare(`
    SELECT id, name, city, state, country, owner, tags, notes, region
    FROM sites
  `).all() as any[];

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    country: r.country,
    owner: r.owner,
    tags: JSON.parse(r.tags || '[]'),
    notes: r.notes || '',
    region: r.region || '',
  }));
}

function signalExists(db: DatabaseSync, siteId: string, description: string, sourceUrl?: string): boolean {
  if (sourceUrl) {
    const byUrl = db.prepare(
      `SELECT COUNT(*) as n FROM signals WHERE source_url = ?`
    ).get(sourceUrl) as { n: number };
    if (byUrl.n > 0) return true;
  }
  // Fuzzy dedup: same site + first 80 chars of description
  const prefix = description.slice(0, 80);
  const byDesc = db.prepare(
    `SELECT COUNT(*) as n FROM signals WHERE site_id = ? AND description LIKE ?`
  ).get(siteId, prefix + '%') as { n: number };
  return byDesc.n > 0;
}

function insertSignal(db: DatabaseSync, signal: RawSignal): void {
  db.prepare(`
    INSERT INTO signals (site_id, type, date, description, source_url, confidence, auto_generated)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    signal.siteId,
    signal.type,
    signal.date,
    signal.description,
    signal.sourceUrl ?? null,
    signal.confidence,
  );
}

export async function runSource(db: DatabaseSync, sourceKey: string): Promise<IngestionResult> {
  const source = SOURCES[sourceKey];
  if (!source) throw new Error(`Unknown source: ${sourceKey}`);

  const start = Date.now();
  const sites = loadSites(db);
  if (sites.length === 0) {
    return { source: sourceKey, label: source.label, signalsFound: 0, signalsNew: 0, durationMs: 0,
             error: 'No sites in database — run Seed first' };
  }

  let signals: RawSignal[] = [];
  let error: string | undefined;

  try {
    signals = await source.run(sites);
  } catch (e: any) {
    error = e.message || String(e);
  }

  let signalsNew = 0;
  if (signals.length > 0) {
    db.exec('BEGIN');
    try {
      for (const sig of signals) {
        if (!sig.siteId || !sig.description) continue;
        // Verify site exists
        const siteExists = db.prepare(`SELECT COUNT(*) as n FROM sites WHERE id = ?`).get(sig.siteId) as { n: number };
        if (siteExists.n === 0) continue;
        if (signalExists(db, sig.siteId, sig.description, sig.sourceUrl)) continue;
        insertSignal(db, sig);
        signalsNew++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return {
    source: sourceKey,
    label: source.label,
    signalsFound: signals.length,
    signalsNew,
    error,
    durationMs: Date.now() - start,
  };
}

export async function runAllSources(db: DatabaseSync): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  for (const key of Object.keys(SOURCES)) {
    try {
      results.push(await runSource(db, key));
    } catch (e: any) {
      results.push({
        source: key,
        label: SOURCES[key].label,
        signalsFound: 0,
        signalsNew: 0,
        error: e.message,
        durationMs: 0,
      });
    }
  }
  return results;
}
