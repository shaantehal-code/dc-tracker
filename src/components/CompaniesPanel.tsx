'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ChevronRight, Zap, Building2, ExternalLink } from 'lucide-react';

interface CompanyRow {
  name: string;
  color: string;
  siteCount: number;
  totalMW: number;
  avgScore: number;
  topScore: number;
  signals30d: number;
  latestSignal: { date: string; type: string; description: string; site: string } | null;
  topSites: { id: string; name: string; region: string; opportunity_score: number; power_capacity_mw: number }[];
  searchKeyword: string;
  secCik: string | null;
}

interface Props {
  onSelectCompany: (keyword: string) => void;
}

const SIG_ICON: Record<string, string> = {
  interconnection_request: '⚡', building_permit: '🏗', water_permit: '💧',
  zoning_change: '📋', news: '📰', sec_filing: '📄', job_posting: '👔',
  land_sale: '🏞', partner_announcement: '🤝', power_plant_retirement: '🔌',
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 65 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[10px] font-medium" style={{ color }}>{score}</span>
    </div>
  );
}

export default function CompaniesPanel({ onSelectCompany }: Props) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch('/api/companies')
      .then(r => r.json())
      .then(d => { setCompanies(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-slate-500 text-sm">
        <RefreshCw size={14} className="animate-spin" /> Loading companies…
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-500 text-sm p-6 text-center">
        <Building2 size={28} className="text-slate-700" />
        <span>No company data yet. Seed the database to populate sites with owner information.</span>
      </div>
    );
  }

  const totalMW = companies.reduce((s, c) => s + c.totalMW, 0);

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">

      {/* Summary stat */}
      <div className="grid grid-cols-3 gap-3 mb-1">
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <div className="text-lg font-bold text-white">{companies.length}</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Operators tracked</div>
        </div>
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <div className="text-lg font-bold text-white">{companies.reduce((s,c) => s+c.siteCount, 0)}</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Total sites</div>
        </div>
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <div className="text-lg font-bold text-white">{(totalMW / 1000).toFixed(1)} GW</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Total capacity</div>
        </div>
      </div>

      {/* Company rows */}
      {companies.map(c => (
        <div key={c.name} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg overflow-hidden">
          {/* Main row */}
          <button
            onClick={() => setExpanded(expanded === c.name ? null : c.name)}
            className="w-full flex items-center gap-3 p-3 hover:bg-[#111118] transition-colors text-left"
          >
            {/* Color dot */}
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />

            {/* Name + sites */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white leading-tight">{c.name}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {c.siteCount} site{c.siteCount !== 1 ? 's' : ''} · {c.totalMW.toLocaleString()} MW
              </div>
            </div>

            {/* Score */}
            <ScoreBar score={c.avgScore} />

            {/* Signals 30d */}
            {c.signals30d > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-blue-400 shrink-0">
                <Zap size={10} />
                {c.signals30d}
              </div>
            )}

            <ChevronRight size={14} className={`text-slate-600 shrink-0 transition-transform ${expanded === c.name ? 'rotate-90' : ''}`} />
          </button>

          {/* Expanded detail */}
          {expanded === c.name && (
            <div className="border-t border-[#1a1a2a] px-3 pb-3 pt-2">
              {/* Top sites */}
              {c.topSites.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Top Sites</div>
                  <div className="flex flex-col gap-1">
                    {c.topSites.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-300 flex-1 truncate">{s.name}</span>
                        <span className="text-slate-600 shrink-0">{s.region}</span>
                        <span className="text-slate-400 shrink-0 w-16 text-right">{s.power_capacity_mw} MW</span>
                        <span className="font-medium shrink-0 w-8 text-right" style={{ color: s.opportunity_score >= 80 ? '#22c55e' : '#f59e0b' }}>{s.opportunity_score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Latest signal */}
              {c.latestSignal && (
                <div className="mb-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Latest Signal (30d)</div>
                  <div className="bg-[#111118] rounded p-2 border border-[#1e1e2e]">
                    <div className="text-[10px] text-slate-400 mb-1">
                      {SIG_ICON[c.latestSignal.type] || '📌'} {c.latestSignal.type.replace(/_/g,' ')} · {c.latestSignal.date} · {c.latestSignal.site}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-snug">{c.latestSignal.description}</div>
                  </div>
                </div>
              )}

              {/* Filter button */}
              <button
                onClick={() => onSelectCompany(c.searchKeyword)}
                className="w-full text-xs py-1.5 px-3 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-300 hover:text-white transition-colors text-center"
              >
                View all {c.siteCount} site{c.siteCount !== 1 ? 's' : ''} on map →
              </button>

              {/* SEC filings link */}
              {c.secCik && (
                <a
                  href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.secCik}&type=8-K&dateb=&owner=include&count=10`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 bg-[#0d0d14] hover:bg-[#111118] border border-[#1e1e2e] rounded text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <ExternalLink size={10} />
                  SEC EDGAR Filings
                </a>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
