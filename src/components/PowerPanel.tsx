'use client';

import { useEffect, useState } from 'react';
import { Zap, RefreshCw, FileDown, TrendingDown } from 'lucide-react';

interface PowerState {
  state: string;
  name: string;
  priceMwh: number;
  trackedSites: number;
  trackedMW: number;
  opportunity: boolean;
}

interface PowerData {
  updated: string;
  national: { avgMwh: number; cheapest: string; mostExpensive: string };
  states: PowerState[];
  error?: string;
}

function priceColor(p: number): string {
  if (p <= 50) return '#22c55e';
  if (p <= 70) return '#f59e0b';
  return '#ef4444';
}

function PriceBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
  return (
    <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: priceColor(value) }} />
    </div>
  );
}

export default function PowerPanel() {
  const [data, setData] = useState<PowerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setError('');
    fetch('/api/power')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(load, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-slate-500 text-sm">
        <RefreshCw size={14} className="animate-spin" /> Loading power markets…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-500 text-sm">
        <span>Failed to load power markets.</span>
        <button onClick={load} className="text-xs text-blue-400 underline">Retry</button>
      </div>
    );
  }

  if (data.error && (!data.states || data.states.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-500 text-sm text-center px-6">
        <Zap size={20} className="text-slate-600" />
        <span>Power market data requires EIA_API_KEY.</span>
      </div>
    );
  }

  function exportCSV() {
    if (!data) return;
    const rows: string[] = ['state,priceMwh,trackedSites,trackedMW,opportunity'];
    data.states.forEach(s =>
      rows.push(`${s.state},${s.priceMwh},${s.trackedSites},${s.trackedMW},${s.opportunity}`)
    );
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `power-markets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxPrice = Math.max(...data.states.map(s => s.priceMwh), 1);

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-amber-400" />
            <span className="text-sm font-bold text-white">US Power Markets</span>
            {data.updated && (
              <span className="text-[10px] text-slate-500 bg-[#1a1a2e] border border-[#2d2d4e] rounded px-1.5 py-0.5">
                {data.updated}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Industrial electricity price by state · cheapest = best for DC siting
          </span>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <FileDown size={11} />
          Export CSV
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <Zap size={14} className="text-amber-400 mb-2" />
          <div className="text-lg font-bold text-white leading-tight">${data.national.avgMwh}/MWh</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">National Avg</div>
        </div>
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <TrendingDown size={14} className="text-green-400 mb-2" />
          <div className="text-lg font-bold text-white leading-tight truncate">{data.national.cheapest || '—'}</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Cheapest State</div>
        </div>
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <Zap size={14} className="text-red-400 mb-2" />
          <div className="text-lg font-bold text-white leading-tight truncate">{data.national.mostExpensive || '—'}</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Most Expensive</div>
        </div>
      </div>

      {/* ── Ranked state list ── */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
          State Rankings · Cheapest First
        </div>
        <div className="flex flex-col gap-2">
          {data.states.map((s, i) => (
            <div key={s.state} className="flex items-center gap-2.5">
              <span className="text-[10px] text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
              <div className="flex items-center gap-1.5 w-32 shrink-0 min-w-0">
                <span className="text-[11px] text-slate-300 truncate">{s.name}</span>
                {s.opportunity && (
                  <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider shrink-0">
                    Opportunity
                  </span>
                )}
              </div>
              <PriceBar value={s.priceMwh} max={maxPrice} />
              <span
                className="text-[11px] font-semibold w-16 text-right shrink-0"
                style={{ color: priceColor(s.priceMwh) }}
              >
                ${s.priceMwh.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-500 w-28 text-right shrink-0 hidden sm:inline truncate">
                {s.trackedSites > 0
                  ? `${s.trackedSites} site${s.trackedSites !== 1 ? 's' : ''} · ${s.trackedMW.toLocaleString()} MW`
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
