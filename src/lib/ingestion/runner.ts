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
import { runIsoQueues } from './iso-queues';
import { runPermitTracker } from './permit-tracker';
import { runJobSignals } from './job-signals';
import { runEarningsWatch } from './earnings-watch';

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
    desc: 'DCD, The Register, DCFrontier + 22 more trade/CRE/energy feeds & GNews searches',
    run: runNewsRss,
  },
  eia: {
    label: 'EIA Power Data',
    desc: 'Monthly US electricity retail prices (requires EIA_API_KEY)',
    run: runEia,
  },
  ferc: {
    label: 'Power Grid Intel',
    desc: 'PPA deals, nuclear agreements, grid interconnection news',
    run: runFerc,
  },
  gdelt: {
    label: 'Global Expansion',
    desc: 'International DC construction, investment & greenfield announcements',
    run: runGdelt,
  },
  iso_queues: {
    label: 'ISO Queue Monitor',
    desc: 'All 7 US ISO/RTOs + non-ISO utilities + Canada — large-load interconnection requests',
    run: runIsoQueues,
  },
  permit_tracker: {
    label: 'Permit Tracker',
    desc: 'County building permits, water permits & zoning changes across 13+ DC-heavy counties',
    run: runPermitTracker,
  },
  job_signals: {
    label: 'Job Signals',
    desc: 'Indeed RSS + news — DC construction hiring as 6-12 month leading indicator',
    run: runJobSignals,
  },
  earnings_watch: {
    label: 'Earnings Watch',
    desc: 'Hyperscaler & DC REIT earnings calls / investor days — capacity announcements',
    run: runEarningsWatch,
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

// Strip source-label prefixes like "Power Grid: " or "Global Intel: [DCD] " before dedup comparison
function normalizeDesc(description: string): string {
  return description
    .replace(/^(Power Grid|Global Intel|FERC filing):\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
}

function signalExists(db: DatabaseSync, siteId: string, description: string, sourceUrl?: string): boolean {
  if (sourceUrl) {
    const byUrl = db.prepare(
      `SELECT COUNT(*) as n FROM signals WHERE source_url = ?`
    ).get(sourceUrl) as { n: number };
    if (byUrl.n > 0) return true;
  }
  // Fuzzy dedup: same site + first 80 chars of normalized description (strips source prefixes)
  const prefix = normalizeDesc(description).slice(0, 80);
  const byDesc = db.prepare(
    `SELECT COUNT(*) as n FROM signals WHERE site_id = ? AND REPLACE(REPLACE(description, 'Power Grid: ', ''), 'Global Intel: ', '') LIKE ?`
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
  const updatedSites = new Set<string>();
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
        if (sig.confidence === 'high') updatedSites.add(sig.siteId);
      }
      // Bump opportunity score for sites with new high-confidence signals (max 95)
      for (const siteId of Array.from(updatedSites)) {
        db.prepare(`
          UPDATE sites SET opportunity_score = MIN(95, opportunity_score + 3)
          WHERE id = ?
        `).run(siteId);
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

// Post alert to WEBHOOK_URL (env) when watchlisted sites get new high-confidence signals.
// Auto-detects Discord vs Slack/generic by URL pattern and formats accordingly.
async function fireWebhookAlerts(db: DatabaseSync, newSignals: RawSignal[]): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl || newSignals.length === 0) return;

  const highConf = newSignals.filter(s => s.confidence === 'high');
  if (highConf.length === 0) return;

  const siteIds = Array.from(new Set(highConf.map(s => s.siteId)));
  const placeholders = siteIds.map(() => '?').join(',');
  const watched = db.prepare(
    `SELECT id, name, opportunity_score FROM sites WHERE id IN (${placeholders}) AND watchlisted = 1`
  ).all(...siteIds) as { id: string; name: string; opportunity_score: number }[];

  if (watched.length === 0) return;

  const isDiscord = webhookUrl.includes('discord.com/api/webhooks');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dc-tracker-production.up.railway.app';

  for (const site of watched) {
    const siteSignals = highConf.filter(s => s.siteId === site.id);
    const sigTypeIcon: Record<string, string> = {
      interconnection_request: '⚡', building_permit: '🏗', water_permit: '💧',
      zoning_change: '📋', news: '📰', sec_filing: '📄', job_posting: '👔',
      land_sale: '🏞', partner_announcement: '🤝', power_plant_retirement: '🔌',
    };
    const sigLines = siteSignals.slice(0, 5).map(s =>
      `${sigTypeIcon[s.type] || '📌'} **${s.type.replace(/_/g, ' ')}** · ${s.date}\n> ${s.description.slice(0, 120)}${s.sourceUrl ? `\n> [Source](${s.sourceUrl})` : ''}`
    ).join('\n\n');

    let body: string;

    if (isDiscord) {
      const embed = {
        title: `🔔 ${site.name}`,
        description: `**${siteSignals.length} new high-confidence signal${siteSignals.length !== 1 ? 's' : ''}** on a watchlisted site`,
        color: 0x3b82f6,
        fields: siteSignals.slice(0, 5).map(s => ({
          name: `${sigTypeIcon[s.type] || '📌'} ${s.type.replace(/_/g, ' ')} · ${s.date}`,
          value: s.description.slice(0, 200) + (s.sourceUrl ? ` [→](${s.sourceUrl})` : ''),
          inline: false,
        })),
        footer: { text: `DC Tracker · opportunity score ${site.opportunity_score}` },
        timestamp: new Date().toISOString(),
        url: `${appUrl}`,
      };
      if (siteSignals.length > 5) {
        embed.fields.push({ name: `…and ${siteSignals.length - 5} more`, value: 'Open DC Tracker for full feed', inline: false });
      }
      body = JSON.stringify({ embeds: [embed] });
    } else {
      // Generic JSON — works with Slack incoming webhooks, Make, Zapier
      body = JSON.stringify({
        text: `🔔 *${site.name}* — ${siteSignals.length} new high-confidence signal${siteSignals.length !== 1 ? 's' : ''}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*🔔 ${site.name}*\n${siteSignals.length} new signal${siteSignals.length !== 1 ? 's' : ''} · score ${site.opportunity_score}` } },
          { type: 'section', text: { type: 'mrkdwn', text: sigLines || '(no details)' } },
          { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open DC Tracker' }, url: appUrl }] },
        ],
      });
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* webhook failures are non-fatal */ }
  }
}

// Decay opportunity scores for sites with no recent high-confidence signals.
// Runs once per full cycle — score drifts toward 30 (floor) if inactive 30+ days.
function decayOpportunityScores(db: DatabaseSync): void {
  try {
    db.prepare(`
      UPDATE sites
      SET opportunity_score = MAX(30, opportunity_score - 1)
      WHERE opportunity_score > 30
        AND id NOT IN (
          SELECT DISTINCT site_id FROM signals
          WHERE confidence = 'high'
            AND auto_generated = 1
            AND date >= date('now', '-30 days')
        )
    `).run();
  } catch { /* non-fatal */ }
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
  decayOpportunityScores(db);

  // Collect all new signals from this run and fire webhook for watchlisted sites
  const allNewSignals: RawSignal[] = [];
  // Re-query signals inserted in the last 5 minutes as a proxy for "this run"
  try {
    const fresh = db.prepare(
      `SELECT site_id, type, date, description, source_url, confidence FROM signals
       WHERE auto_generated = 1 AND created_at >= datetime('now', '-5 minutes')`
    ).all() as any[];
    for (const r of fresh) {
      allNewSignals.push({
        siteId: r.site_id, type: r.type, date: r.date,
        description: r.description, sourceUrl: r.source_url ?? undefined,
        confidence: r.confidence,
      });
    }
    await fireWebhookAlerts(db, allNewSignals);
  } catch { /* non-fatal */ }

  return results;
}
