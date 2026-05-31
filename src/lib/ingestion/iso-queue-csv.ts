/**
 * ISO Queue CSV/API Ingestion — fetches generator interconnection queue data
 * directly from PJM, MISO, SPP (CSV downloads) and ERCOT (JSON API).
 *
 * Each row = a queued project ≥200 MW → matched to DC Tracker sites via
 * site-matcher → generates high-confidence interconnection_request signals
 * with queue position, ISO, MW, fuel type, and county/state.
 *
 * Skips solar/wind/PV (utility-scale generation, not DC load).
 * Falls back gracefully if any ISO source is unavailable.
 */
import type { RawSignal, SiteStub } from './types';
import { buildSiteIndex, matchText } from './site-matcher';

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

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
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

async function fetchPjm(): Promise<QueueRow[]> {
  try {
    const res = await fetch(
      'https://pjm.com/pub/planning/intercon_queues/active.csv',
      { signal: AbortSignal.timeout(30000) }
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes(',')) return [];
    return parseCSV(text).map(r => ({
      projectName: pick(r, 'project_name', 'name', 'project'),
      mw: extractMW(r),
      state: pick(r, 'state', 'states', 'gen_state'),
      county: pick(r, 'county', 'counties', 'location', 'gen_county'),
      fuel: pick(r, 'fuel', 'fuel_type', 'type', 'generation_type'),
      status: pick(r, 'status', 'project_status', 'queue_status'),
      queueDate: pick(r, 'request_received', 'queue_date', 'received_date', 'date_received'),
      queuePosition: pick(r, 'queue_pos', 'queue_position', 'pos', 'queue_no', 'project_number'),
      iso: 'PJM',
    })).filter(r => r.mw >= 200);
  } catch { return []; }
}

async function fetchMiso(): Promise<QueueRow[]> {
  // MISO publishes its GI queue CSV through their ECM document system
  const urls = [
    'https://www.misoenergy.org/_layouts/MISO/ECM/Redirect.aspx?id=301038',
    'https://www.misoenergy.org/_layouts/MISO/ECM/Redirect.aspx?id=295870',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes(',') || text.trim().startsWith('<')) continue;
      const rows = parseCSV(text).map(r => ({
        projectName: pick(r, 'project_name', 'name', 'gen_name', 'generator_name'),
        mw: extractMW(r),
        state: pick(r, 'state', 'gen_state', 'interconnection_state'),
        county: pick(r, 'county', 'gen_county', 'interconnection_county'),
        fuel: pick(r, 'fuel_type', 'fuel', 'technology', 'generation_type'),
        status: pick(r, 'queue_status', 'status', 'study_phase'),
        queueDate: pick(r, 'queue_date', 'received', 'request_date', 'date_received'),
        queuePosition: pick(r, 'queue_id', 'queue_pos', 'id', 'project_id'),
        iso: 'MISO',
      })).filter(r => r.mw >= 200);
      if (rows.length > 0) return rows;
    } catch { continue; }
  }
  return [];
}

async function fetchSpp(): Promise<QueueRow[]> {
  try {
    const res = await fetch(
      'https://www.spp.org/documents/64289/generator%20interconnection%20queue.csv',
      { signal: AbortSignal.timeout(30000) }
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes(',')) return [];
    return parseCSV(text).map(r => ({
      projectName: pick(r, 'project_name', 'name', 'application_name', 'gen_name'),
      mw: extractMW(r),
      state: pick(r, 'state', 'gen_state', 'location_state'),
      county: pick(r, 'county', 'gen_county', 'location_county'),
      fuel: pick(r, 'fuel_type', 'fuel', 'generation_type', 'resource_type'),
      status: pick(r, 'status', 'queue_status', 'study_status'),
      queueDate: pick(r, 'queue_date', 'received_date', 'request_date', 'date_received'),
      queuePosition: pick(r, 'serial_no', 'queue_id', 'queue_pos', 'number', 'id'),
      iso: 'SPP',
    })).filter(r => r.mw >= 200);
  } catch { return []; }
}

async function fetchErcot(): Promise<QueueRow[]> {
  // ERCOT publishes GI status as a JSON dashboard endpoint
  try {
    const res = await fetch(
      'https://www.ercot.com/api/1/services/read/dashboards/generator-interconnection-status.json',
      { signal: AbortSignal.timeout(20000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as any;
    const items: any[] = Array.isArray(json) ? json
      : (json.data ?? json.items ?? json.results ?? json.rows ?? []);
    return items.map(r => ({
      projectName: r.projectName ?? r.name ?? r.gen_name ?? r.generatorName ?? '',
      mw: parseFloat(r.mw ?? r.nameplateMW ?? r.capacity ?? r.MW ?? r.requestedMW ?? '0') || 0,
      state: 'TX',
      county: r.county ?? r.location ?? r.countyName ?? '',
      fuel: r.fuelType ?? r.fuel ?? r.technology ?? r.resourceType ?? '',
      status: r.status ?? r.queueStatus ?? r.studyPhase ?? '',
      queueDate: r.queueDate ?? r.receivedDate ?? r.requestDate ?? '',
      queuePosition: String(r.inr ?? r.queuePos ?? r.id ?? r.projectId ?? ''),
      iso: 'ERCOT',
    })).filter(r => r.mw >= 200);
  } catch { return []; }
}

// ── Source URL per ISO ────────────────────────────────────────────────────────

const ISO_SOURCE_URL: Record<string, string> = {
  PJM:   'https://pjm.com/planning/project-queues/interconnection-queue',
  MISO:  'https://www.misoenergy.org/planning/interconnection-and-reliability-studies/gi_queue/',
  SPP:   'https://www.spp.org/engineering/generator-interconnection/',
  ERCOT: 'https://www.ercot.com/gridinfo/connect',
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

    const location = row.county ? `${row.county} County, ${row.state}` : row.state;
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
