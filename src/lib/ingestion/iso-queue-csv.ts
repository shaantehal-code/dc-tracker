/**
 * ISO Queue Interconnection Ingestion.
 *
 * Endpoint reality (verified 2026-09):
 *   • SPP   — LIVE. Public CSV at opsportal.spp.org (parsed below).
 *   • PJM   — the old public bulk CSV was discontinued; queue data now lives
 *             behind Data Miner 2 (requires a free Ocp-Apim subscription key).
 *             Opt-in via PJM_DATAMINER_API_KEY; skipped cleanly otherwise.
 *   • ERCOT — no public JSON/CSV feed; the GIS queue is an Excel report inside
 *             the ERCOT MIS. Not fetchable as CSV, so skipped (documented stub).
 *   • MISO  — official JSON API exists but sits behind a Cloudflare bot
 *             challenge; attempted best-effort, degrades gracefully on 403.
 *
 * Each queue row ≥200 MW is matched to DC Tracker sites via the site-matcher and
 * emitted as an interconnection_request signal (MW, fuel, county/state, status).
 * Utility-scale solar/wind is skipped (generation, not dedicated DC load).
 * Every fetch fails closed (returns []), so a dead ISO never breaks the run.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

const UA = 'Mozilla/5.0 (compatible; dc-tracker-intelligence/1.0; +contact@dctracker.io)';

interface QueueRow {
  projectName: string;
  mw: number;
  state: string;
  county: string;
  fuel: string;
  status: string;
  queueDate: string;
  queuePosition: string;
  iso: string;
}

// ── CSV utilities ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += c;
  }
  result.push(current.trim());
  return result;
}

/** Parse CSV to row objects with normalized (snake_case) header keys.
 *  `skipLeading` regex drops a metadata preamble line (e.g. SPP's "Last Updated On"). */
function parseCSV(text: string, skipLeading?: RegExp): Record<string, string>[] {
  let lines = text.split('\n').filter(l => l.trim());
  if (skipLeading && lines.length && skipLeading.test(lines[0])) lines = lines.slice(1);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  );
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) row[h] = (values[i] ?? '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v.length > 0));
}

function extractMW(row: Record<string, string>): number {
  const candidates = [
    'mw', 'nameplate_mw', 'mw_in_service', 'capacity_mw', 'nameplate_capacity',
    'capacity', 'max_summer_mw', 'max_winter_mw',
    'mw_capacity', 'service_mw', 'request_mw', 'summer_capacity_mw', 'winter_capacity_mw',
  ];
  for (const k of candidates) {
    const v = parseFloat(row[k] ?? '');
    if (!isNaN(v) && v > 0) return v;
  }
  for (const [k, v] of Object.entries(row)) {
    if (k.includes('mw') && !k.includes('name')) {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) { if (row[k]) return row[k]; }
  return '';
}

function toDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /**/ }
  return new Date().toISOString().slice(0, 10);
}

const SKIP_FUEL_PATTERNS = ['solar', 'wind', 'photovoltaic', ' pv', 'offshore', 'onshore wind'];
function isLoadTech(fuel: string): boolean {
  const f = fuel.toLowerCase();
  return !SKIP_FUEL_PATTERNS.some(p => f.includes(p));
}

// ── Per-ISO fetchers ──────────────────────────────────────────────────────────

/** SPP — LIVE public CSV. First line is a "Last Updated On" metadata row. */
async function fetchSpp(): Promise<QueueRow[]> {
  try {
    const res = await fetch(
      'https://opsportal.spp.org/Studies/GenerateActiveCSV',
      { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } }
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes(',')) return [];
    return parseCSV(text, /last updated on/i).map(r => ({
      projectName: pick(r, 'generation_interconnection_number', 'ifs_queue_number'),
      mw: extractMW(r),
      state: pick(r, 'state'),
      county: pick(r, 'nearest_town_or_county'),
      fuel: pick(r, 'fuel_type', 'generation_type'),
      status: pick(r, 'status'),
      queueDate: pick(r, 'request_received', 'in_service_date'),
      queuePosition: pick(r, 'generation_interconnection_number', 'ifs_queue_number'),
      iso: 'SPP',
    })).filter(r => r.mw >= 200);
  } catch { return []; }
}

/** MISO — official JSON API, but Cloudflare-gated. Best-effort; graceful on 403. */
async function fetchMiso(): Promise<QueueRow[]> {
  try {
    const res = await fetch(
      'https://www.misoenergy.org/api/giqueue/getprojects',
      { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA, 'Accept': 'application/json' } }
    );
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return []; // Cloudflare challenge returns HTML
    const json = await res.json() as any;
    const items: any[] = Array.isArray(json) ? json : (json.projects ?? json.data ?? json.items ?? []);
    return items.map((r: any) => ({
      projectName: String(r.queueNumber ?? r.projectNumber ?? r.projectName ?? r.name ?? ''),
      mw: parseFloat(r.summerMW ?? r.netMW ?? r.nameplateMW ?? r.capacity ?? r.mw ?? '0') || 0,
      state: r.state ?? r.stateProvince ?? '',
      county: r.county ?? r.countyName ?? '',
      fuel: r.fuelType ?? r.fuel ?? r.technology ?? r.generationType ?? '',
      status: r.applicationStatus ?? r.studyPhase ?? r.status ?? '',
      queueDate: r.queueDate ?? r.requestDate ?? r.receivedDate ?? '',
      queuePosition: String(r.queueNumber ?? r.projectNumber ?? ''),
      iso: 'MISO',
    })).filter((r: QueueRow) => r.mw >= 200);
  } catch { return []; }
}

/** PJM — opt-in via Data Miner 2 (free subscription key). Skipped without a key. */
async function fetchPjm(): Promise<QueueRow[]> {
  const key = process.env.PJM_DATAMINER_API_KEY;
  if (!key) return []; // public bulk CSV discontinued; requires Data Miner 2 key
  try {
    const res = await fetch(
      'https://api.pjm.com/api/v1/serviced_requests?rowCount=50000&startRow=1',
      { signal: AbortSignal.timeout(30000), headers: { 'Ocp-Apim-Subscription-Key': key, 'Accept': 'application/json' } }
    );
    if (!res.ok) return [];
    const json = await res.json() as any;
    const items: any[] = json.items ?? json.data ?? (Array.isArray(json) ? json : []);
    return items.map((r: any) => ({
      projectName: String(r.projectName ?? r.name ?? r.queueNumber ?? ''),
      mw: parseFloat(r.mwCapacity ?? r.mwEnergy ?? r.mwInService ?? r.nameplateMW ?? r.mw ?? '0') || 0,
      state: r.state ?? '',
      county: r.county ?? '',
      fuel: r.fuel ?? r.fuelType ?? '',
      status: r.status ?? r.projectStatus ?? '',
      queueDate: r.submittedDate ?? r.queueDate ?? '',
      queuePosition: String(r.queueNumber ?? r.queueEntity ?? ''),
      iso: 'PJM',
    })).filter((r: QueueRow) => r.mw >= 200);
  } catch { return []; }
}

/** ERCOT — no public CSV/JSON queue feed (GIS report is Excel inside the MIS).
 *  Interconnection coverage for Texas comes via the EIA-860M source and news
 *  feeds instead. Documented stub; returns nothing rather than a dead request. */
async function fetchErcot(): Promise<QueueRow[]> {
  return [];
}

// ── Human-facing source landing pages (for signal sourceUrl) ───────────────────

const ISO_SOURCE_URL: Record<string, string> = {
  PJM:   'https://www.pjm.com/planning/services-requests/interconnection-queues',
  MISO:  'https://www.misoenergy.org/planning/generator-interconnection/GI_Queue/',
  SPP:   'https://www.spp.org/engineering/generator-interconnection/',
  ERCOT: 'https://www.ercot.com/gridinfo/resource',
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function runIsoQueueCsv(sites: SiteStub[]): Promise<RawSignal[]> {
  const index = buildSiteIndex(sites);
  const signals: RawSignal[] = [];
  const seen = new Set<string>();

  const [pjmRows, misoRows, sppRows, ercotRows] = await Promise.all([
    fetchPjm(), fetchMiso(), fetchSpp(), fetchErcot(),
  ]);

  console.log(
    `[ISO-Queue-CSV] PJM=${pjmRows.length} MISO=${misoRows.length} SPP=${sppRows.length} ERCOT=${ercotRows.length}`
  );

  for (const row of [...pjmRows, ...misoRows, ...sppRows, ...ercotRows]) {
    if (!row.projectName || row.mw < 200) continue;
    if (!isLoadTech(row.fuel)) continue;

    const dedupKey = `${row.iso}-${row.state}-${row.county}-${Math.round(row.mw)}-${row.projectName}`
      .toLowerCase().replace(/\s+/g, '-').slice(0, 120);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const matchStr = `${row.projectName} ${row.state} ${row.county}`;
    const matched = matchText(matchStr, index, 3);
    if (matched.length === 0) continue;

    const location = row.county ? `${row.county}, ${row.state}` : row.state;
    const posStr = row.queuePosition ? ` [#${row.queuePosition}]` : '';
    const fuelStr = row.fuel ? ` — ${row.fuel}` : '';
    const statusStr = row.status ? ` (${row.status})` : '';
    const description =
      `${row.iso} queue${posStr}: ${row.projectName}${fuelStr}, ${Math.round(row.mw)} MW in ${location}${statusStr}`;

    const date = toDate(row.queueDate);
    const confidence: 'high' | 'medium' = row.mw >= 500 ? 'high' : 'medium';

    for (const siteId of matched) {
      signals.push({
        siteId,
        type: 'interconnection_request',
        date,
        description,
        sourceUrl: ISO_SOURCE_URL[row.iso],
        confidence,
      });
    }
  }

  return signals;
}
