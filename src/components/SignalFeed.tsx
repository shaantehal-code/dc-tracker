'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

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

const CONF_COLOR: Record<string,string> = { high: 'text-green-400', medium: 'text-yellow-400', low: 'text-slate-500' };
const SIG_ICON: Record<string,string> = {
  interconnection_request: '⚡', building_permit: '🏗', water_permit: '💧',
  zoning_change: '📋', news: '📰', sec_filing: '📄', job_posting: '👔',
  land_sale: '🏞', satellite_change: '🛰', power_plant_retirement: '🔌', partner_announcement: '🤝',
};

export default function SignalFeed() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/signals');
    if (res.ok) setSignals(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-[#1e1e2e]">
        <h2 className="text-sm font-semibold text-white">Signal Feed</h2>
        <button onClick={load} className="text-slate-500 hover:text-white" disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {signals.length === 0 && !loading && (
          <div className="p-4 text-slate-600 text-sm text-center">No signals yet. Seed the database to see data.</div>
        )}
        {signals.map(sig => (
          <div key={sig.id} className="px-3 py-2 border-b border-[#12121c] hover:bg-[#111118]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-slate-300 truncate">
                  {SIG_ICON[sig.type] || '📌'} {sig.site_name}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">{sig.type.replace(/_/g,' ')} · {sig.date}</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{sig.description}</p>
              </div>
              <span className={`text-[10px] shrink-0 ${CONF_COLOR[sig.confidence]}`}>{sig.confidence}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
