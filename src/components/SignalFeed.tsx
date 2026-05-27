'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';

interface SignalRow {
  id: number;
  site_id: string;
  site_name: string;
  type: string;
  date: string;
  description: string;
  source_url?: string;
  confidence: string;
  auto_generated: number;
}

const CONF_COLOR: Record<string, string> = {
  high: 'text-green-400', medium: 'text-yellow-400', low: 'text-slate-500',
};
const SIG_ICON: Record<string, string> = {
  interconnection_request: '⚡', building_permit: '🏗', water_permit: '💧',
  zoning_change: '📋', news: '📰', sec_filing: '📄', job_posting: '👔',
  land_sale: '🏞', satellite_change: '🛰', power_plant_retirement: '🔌',
  partner_announcement: '🤝',
};

type Window = '7' | '30' | '90' | 'all';
const WINDOWS: { id: Window; label: string }[] = [
  { id: '7',   label: '7d' },
  { id: '30',  label: '30d' },
  { id: '90',  label: '90d' },
  { id: 'all', label: 'All' },
];

function freshnessLabel(dateStr: string): { label: string; color: string } {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3)  return { label: 'new',    color: 'bg-green-500/20 text-green-400' };
  if (days <= 14) return { label: `${days}d`, color: 'bg-blue-500/20 text-blue-400' };
  if (days <= 30) return { label: `${days}d`, color: 'bg-yellow-500/20 text-yellow-500' };
  return { label: `${days}d`, color: 'bg-slate-700 text-slate-500' };
}

export default function SignalFeed({ siteId }: { siteId?: string }) {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [window, setWindow] = useState<Window>('all');
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async (w: Window) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '500' });
    if (w !== 'all') params.set('since', w);
    if (siteId) params.set('siteId', siteId);
    const res = await fetch(`/api/signals?${params}`);
    if (res.ok) setSignals(await res.json());
    setLoading(false);
  }, [siteId]);

  useEffect(() => { load(window); }, [load, window]);

  const types = Array.from(new Set(signals.map(s => s.type))).sort();
  const visible = typeFilter ? signals.filter(s => s.type === typeFilter) : signals;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] shrink-0">
        <h2 className="text-sm font-semibold text-white">Signal Feed</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-600">{visible.length.toLocaleString()} signals</span>
          <button onClick={() => load(window)} className="text-slate-500 hover:text-white" disabled={loading}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Time-window tabs */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-[#1e1e2e] shrink-0">
        {WINDOWS.map(w => (
          <button
            key={w.id}
            onClick={() => setWindow(w.id)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              window === w.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-500 hover:text-white hover:bg-[#1a1a2e]'
            }`}
          >
            {w.label}
          </button>
        ))}
        {types.length > 1 && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="ml-auto text-[10px] bg-[#0d0d14] border border-[#1e1e2e] rounded px-1.5 py-0.5 text-slate-400 focus:outline-none"
          >
            <option value="">All types</option>
            {types.map(t => (
              <option key={t} value={t}>{SIG_ICON[t] || '📌'} {t.replace(/_/g,' ')}</option>
            ))}
          </select>
        )}
      </div>

      {/* Signal list */}
      <div className="overflow-y-auto flex-1">
        {visible.length === 0 && !loading && (
          <div className="p-4 text-slate-600 text-sm text-center">
            {window !== 'all' ? `No signals in the last ${window} days.` : 'No signals yet — seed the database.'}
          </div>
        )}
        {visible.map(sig => {
          const freshness = freshnessLabel(sig.date);
          return (
            <div key={sig.id} className="px-3 py-2 border-b border-[#12121c] hover:bg-[#111118] group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px]">{SIG_ICON[sig.type] || '📌'}</span>
                    <span className="text-[11px] font-medium text-slate-300 truncate">{sig.site_name}</span>
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium shrink-0 ${freshness.color}`}>
                      {freshness.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {sig.type.replace(/_/g,' ')} · {sig.date}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{sig.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] ${CONF_COLOR[sig.confidence]}`}>{sig.confidence}</span>
                  {sig.source_url && (
                    <a href={sig.source_url} target="_blank" rel="noopener noreferrer"
                       className="text-slate-700 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
