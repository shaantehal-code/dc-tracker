'use client';

import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Site, FilterState } from '@/types';
import KPIBar from './KPIBar';
import FilterPanel from './FilterPanel';
import SiteList from './SiteList';
import SiteDetail from './SiteDetail';
import SignalFeed from './SignalFeed';
import IngestPanel from './IngestPanel';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

interface Props {
  initialSites: Site[];
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  region: '',
  type: '',
  status: '',
  country: '',
  minScore: 0,
  minPower: 0,
  minLand: 0,
  maxPowerCost: 200,
  watchlistOnly: false,
  sort: 'score',
};

const TABS = ['Map', 'Signals', 'Ingest'] as const;
type Tab = typeof TABS[number];

export default function Dashboard({ initialSites }: Props) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<Tab>('Map');

  const filtered = useMemo(() => {
    let result = sites.filter(s => {
      const q = filters.search.toLowerCase();
      if (q && !s.name.toLowerCase().includes(q) && !s.city.toLowerCase().includes(q)
          && !s.state?.toLowerCase().includes(q) && !s.tags.join(' ').toLowerCase().includes(q)
          && !s.notes.toLowerCase().includes(q)) return false;
      if (filters.region && s.region !== filters.region) return false;
      if (filters.type && s.type !== filters.type) return false;
      if (filters.status && s.status !== filters.status) return false;
      if (filters.country && !s.country.toLowerCase().includes(filters.country.toLowerCase())) return false;
      if (s.opportunityScore < filters.minScore) return false;
      if (s.powerCapacityMW < filters.minPower) return false;
      if (s.landAcres < filters.minLand) return false;
      if (s.powerCostPerMWh > filters.maxPowerCost) return false;
      if (filters.watchlistOnly && !s.watchlisted) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (filters.sort) {
        case 'power': return b.powerCapacityMW - a.powerCapacityMW;
        case 'land': return b.landAcres - a.landAcres;
        case 'cost': return a.powerCostPerMWh - b.powerCostPerMWh;
        case 'name': return a.name.localeCompare(b.name);
        default: return b.opportunityScore - a.opportunityScore;
      }
    });

    return result;
  }, [sites, filters]);

  const selectedSite = useMemo(() => sites.find(s => s.id === selectedId) ?? null, [sites, selectedId]);

  const handleFilterChange = useCallback((partial: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  const handleToggleWatchlist = useCallback(async (id: string) => {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: id }),
    });
    if (res.ok) {
      const { watchlisted } = await res.json();
      setSites(prev => prev.map(s => s.id === id ? { ...s, watchlisted } : s));
    }
  }, []);

  const handleSaveNotes = useCallback(async (id: string, userNotes: string) => {
    const res = await fetch(`/api/sites/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userNotes }),
    });
    if (res.ok) {
      setSites(prev => prev.map(s => s.id === id ? { ...s, userNotes } : s));
    }
  }, []);

  async function seedDb() {
    const res = await fetch('/api/seed');
    const data = await res.json();
    if (data.error) { alert('Seed error: ' + data.error); return; }
    alert(data.message);
    // Reload sites from API
    const sitesRes = await fetch('/api/sites');
    if (sitesRes.ok) setSites(await sitesRes.json());
  }

  function exportCSV() {
    const header = 'Name,City,State,Country,Region,Type,Status,Score,PowerMW,LandAcres,PowerCostPerMWh,PUE,AskingPriceM,Tags';
    const rows = filtered.map(s =>
      [s.name, s.city, s.state||'', s.country, s.region, s.type, s.status, s.opportunityScore,
       s.powerCapacityMW, s.landAcres, s.powerCostPerMWh, s.pueEstimate, s.askingPriceMUSD||'',
       s.tags.join(';')].map(v => `"${v}"`).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dc-sites.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d14] border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-xs font-bold">DC</div>
          <span className="text-sm font-semibold text-white">DC Tracker</span>
          <span className="text-xs text-slate-600">Global Site Intelligence</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={seedDb} className="text-xs px-3 py-1 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-400 hover:text-white transition-colors">
            Seed DB
          </button>
          <button onClick={exportCSV} className="text-xs px-3 py-1 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-400 hover:text-white transition-colors">
            Export CSV
          </button>
          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button key={t}
                className={`text-xs px-3 py-1 rounded transition-colors ${rightTab === t ? 'bg-blue-700 text-white' : 'text-slate-500 hover:text-white'}`}
                onClick={() => setRightTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <KPIBar sites={sites} filtered={filtered} />

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: filters + site list */}
        <div className="flex flex-col w-[320px] shrink-0 border-r border-[#1e1e2e] overflow-hidden">
          <FilterPanel filters={filters} onChange={handleFilterChange} />
          <div className="text-[10px] text-slate-600 px-3 py-1 border-b border-[#1a1a2a]">
            {filtered.length} site{filtered.length !== 1 ? 's' : ''}
          </div>
          <SiteList
            sites={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggleWatchlist={handleToggleWatchlist}
          />
        </div>

        {/* Center: map / signals / ingest */}
        <div className="flex-1 overflow-hidden">
          {rightTab === 'Map' && (
            <MapView sites={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {rightTab === 'Signals' && <SignalFeed />}
          {rightTab === 'Ingest' && <IngestPanel />}
        </div>

        {/* Right panel: site detail */}
        {selectedSite && (
          <div className="w-[320px] shrink-0 border-l border-[#1e1e2e] overflow-hidden flex flex-col">
            <SiteDetail
              site={selectedSite}
              onClose={() => setSelectedId(null)}
              onToggleWatchlist={handleToggleWatchlist}
              onSaveNotes={handleSaveNotes}
            />
          </div>
        )}
      </div>
    </div>
  );
}
