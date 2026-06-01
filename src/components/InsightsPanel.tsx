'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Activity, Zap, Building2, RefreshCw, FileDown } from 'lucide-react';

interface Props { onSelectSite: (id: string) => void; }

interface InsightsData {
  stats: { totalSites: number; totalSignals: number; signals7d: number; totalGW: string };
  byType: { type: string; count: number }[];
  byDay: { date: string; count: number }[];
  scoreDistribution: { bucket: string; count: number; sites: { id: string; name: string; region: string; opportunity_score: number }[] }[];
  topSites: { id: string; name: string; opportunity_score: number; region: string; signal_count: number }[];
  velocityLeaders: { id: string; name: string; opportunity_score: number; hc_signals: number }[];
  byRegion: { region: string; count: number }[];
}

const SIG_ICON: Record<string, string> = {
  interconnection_request: '⚡', building_permit: '🏗', water_permit: '💧',
  zoning_change: '📋', news: '📰', sec_filing: '📄', job_posting: '👔',
  land_sale: '🏞', partner_announcement: '🤝', power_plant_retirement: '🔌',
  satellite_change: '🛰',
};

const SCORE_COLORS: Record<string, string> = {
  '90–100': '#22c55e', '80–89': '#84cc16', '70–79': '#f59e0b',
  '60–69': '#f97316', '50–59': '#ef4444', 'Below 50': '#6b7280',
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 90 ? '#22c55e' : score >= 75 ? '#84cc16' : score >= 60 ? '#f59e0b' : '#ef4444';
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;
}

export default function InsightsPanel({ onSelectSite }: Props) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openBucket, setOpenBucket] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError('');
    fetch('/api/insights')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(load, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-slate-500 text-sm">
        <RefreshCw size={14} className="animate-spin" /> Loading insights…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-slate-500 text-sm">
        <span>Failed to load insights.</span>
        <button onClick={load} className="text-xs text-blue-400 underline">Retry</button>
      </div>
    );
  }

  function exportCSV() {
    if (!data) return;
    const rows: string[] = ['DC Tracker Insights Export', `Generated: ${new Date().toISOString()}`, ''];

    rows.push('=== Signals by Type (90d) ===', 'Type,Count');
    data.byType.forEach(b => rows.push(`"${b.type.replace(/_/g,' ')}",${b.count}`));
    rows.push('');

    rows.push('=== Most Active Sites (30d) ===', 'Name,Region,Score,Signals');
    data.topSites.forEach(s => rows.push(`"${s.name}","${s.region}",${s.opportunity_score},${s.signal_count}`));
    rows.push('');

    rows.push('=== High-Confidence Velocity Leaders (30d) ===', 'Name,Score,HighConfSignals');
    data.velocityLeaders.forEach(s => rows.push(`"${s.name}",${s.opportunity_score},${s.hc_signals}`));
    rows.push('');

    rows.push('=== Signals by Region ===', 'Region,Count');
    data.byRegion.forEach(r => rows.push(`"${r.region || 'unknown'}",${r.count}`));
    rows.push('');

    rows.push('=== Score Distribution ===', 'Bucket,Count');
    data.scoreDistribution.forEach(b => rows.push(`"${b.bucket}",${b.count}`));

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dc-insights-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const maxByType   = Math.max(...data.byType.map(b => b.count), 1);
  const maxByDay    = Math.max(...data.byDay.map(b => b.count), 1);
  const maxScore    = Math.max(...data.scoreDistribution.map(b => b.count), 1);
  const maxRegion   = Math.max(...data.byRegion.map(b => b.count), 1);

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-5">

      {/* Header row with export */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Dashboard</span>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-400 hover:text-white transition-colors"
        >
          <FileDown size={11} />
          Export CSV
        </button>
      </div>

      {/* ── Top stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Sites',     value: data.stats.totalSites,              Icon: Building2,  color: 'text-blue-400' },
          { label: 'Total Signals',   value: data.stats.totalSignals.toLocaleString(), Icon: Activity,   color: 'text-purple-400' },
          { label: 'Signals (7d)',    value: data.stats.signals7d,               Icon: TrendingUp, color: 'text-green-400' },
          { label: 'GW Tracked',      value: `${data.stats.totalGW} GW`,         Icon: Zap,        color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
            <s.Icon size={14} className={`${s.color} mb-2`} />
            <div className="text-lg font-bold text-white leading-tight">{s.value}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Signal activity sparkline (last 30d) ── */}
      {data.byDay.length > 0 && (
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Signal Activity — Last 30 Days
          </div>
          <div className="flex items-end gap-px h-16">
            {data.byDay.map(d => (
              <div
                key={d.date}
                className="flex-1 bg-blue-600 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-default"
                style={{ height: `${Math.max(3, (d.count / maxByDay) * 60)}px` }}
                title={`${d.date}: ${d.count} signal${d.count !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>{data.byDay[0]?.date}</span>
            <span>{data.byDay[data.byDay.length - 1]?.date}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Signal types (90d) ── */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Signals by Type (90d)</div>
          <div className="flex flex-col gap-2">
            {data.byType.map(b => (
              <div key={b.type} className="flex items-center gap-2">
                <span className="text-sm w-5 text-center shrink-0">{SIG_ICON[b.type] || '📌'}</span>
                <span className="text-[11px] text-slate-400 w-32 shrink-0 truncate">{b.type.replace(/_/g, ' ')}</span>
                <Bar value={b.count} max={maxByType} color="#3b82f6" />
                <span className="text-[11px] text-slate-300 w-8 text-right shrink-0">{b.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Score distribution ── */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Opportunity Score Distribution</div>
          <div className="flex flex-col gap-2">
            {data.scoreDistribution.map(b => (
              <div key={b.bucket}>
                <button
                  onClick={() => setOpenBucket(openBucket === b.bucket ? null : b.bucket)}
                  disabled={b.count === 0}
                  className="w-full flex items-center gap-2 py-0.5 rounded hover:bg-[#111118] disabled:cursor-default disabled:hover:bg-transparent transition-colors text-left"
                >
                  <span className="text-[11px] text-slate-400 w-16 shrink-0">{b.bucket}</span>
                  <Bar value={b.count} max={maxScore} color={SCORE_COLORS[b.bucket] || '#6b7280'} />
                  <span className="text-[11px] text-slate-300 w-6 text-right shrink-0">{b.count}</span>
                </button>
                {openBucket === b.bucket && b.sites.length > 0 && (
                  <div className="ml-16 mt-1 mb-1 flex flex-col gap-0.5 border-l border-[#1e1e2e] pl-2">
                    {b.sites.map(s => (
                      <button
                        key={s.id}
                        onClick={() => onSelectSite(s.id)}
                        className="flex items-center gap-2 text-[11px] py-0.5 px-1 rounded hover:bg-[#1a1a2e] text-left transition-colors group"
                      >
                        <ScoreDot score={s.opportunity_score} />
                        <span className="text-slate-300 group-hover:text-white flex-1 truncate">{s.name}</span>
                        <span className="text-slate-600 shrink-0">{s.region}</span>
                        <span className="font-medium text-slate-400 w-6 text-right shrink-0">{s.opportunity_score}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Most active sites (30d) ── */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Most Active Sites (30d)</div>
          <div className="flex flex-col gap-2">
            {data.topSites.length === 0 ? (
              <span className="text-[11px] text-slate-600">No signal activity in last 30 days.</span>
            ) : data.topSites.map((s, i) => (
              <button key={s.id} onClick={() => onSelectSite(s.id)} className="flex items-center gap-2 w-full text-left hover:bg-[#111118] rounded px-1 transition-colors">
                <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}</span>
                <ScoreDot score={s.opportunity_score} />
                <span className="text-[11px] text-slate-300 flex-1 truncate">{s.name}</span>
                <span className="text-[10px] text-slate-500 shrink-0 hidden sm:inline">{s.region}</span>
                <span className="text-[11px] font-medium text-blue-400 w-12 text-right shrink-0">{s.signal_count} sig</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Signals by region ── */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Signals by Region</div>
          <div className="flex flex-col gap-2">
            {data.byRegion.slice(0, 11).map(r => (
              <div key={r.region || 'unknown'} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 w-24 shrink-0 truncate">{r.region || 'unknown'}</span>
                <Bar value={r.count} max={maxRegion} color="#8b5cf6" />
                <span className="text-[11px] text-slate-300 w-8 text-right shrink-0">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── High-confidence velocity leaders ── */}
      {data.velocityLeaders.length > 0 && (
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">🔥 High-Confidence Signal Leaders (30d)</div>
          <div className="flex flex-col gap-2">
            {data.velocityLeaders.map((s, i) => (
              <button key={s.id} onClick={() => onSelectSite(s.id)} className="flex items-center gap-2 w-full text-left hover:bg-[#111118] rounded px-1 transition-colors">
                <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}</span>
                <ScoreDot score={s.opportunity_score} />
                <span className="text-[11px] text-slate-300 flex-1 truncate">{s.name}</span>
                <span className="text-[11px] font-medium text-green-400 w-16 text-right shrink-0">{s.hc_signals} high-conf</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
