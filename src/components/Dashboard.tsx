'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Site, FilterState } from '@/types';
import KPIBar from './KPIBar';
import FilterPanel from './FilterPanel';
import SiteList from './SiteList';
import SiteDetail from './SiteDetail';
import SignalFeed from './SignalFeed';
import IngestPanel from './IngestPanel';
import RemoteControlPanel from './RemoteControlPanel';
import { List, Map as MapIcon, Zap, Upload, Radio, SlidersHorizontal, X, Database, FileDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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

const DESKTOP_TABS = ['Map', 'Signals', 'Ingest', 'Remote'] as const;
type DesktopTab = typeof DESKTOP_TABS[number];

type MobileTab = 'sites' | 'map' | 'signals' | 'ingest' | 'remote';
const MOBILE_TABS: { id: MobileTab; label: string; Icon: React.ElementType }[] = [
  { id: 'sites', label: 'Sites', Icon: List },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'signals', label: 'Signals', Icon: Zap },
  { id: 'ingest', label: 'Ingest', Icon: Upload },
  { id: 'remote', label: 'Remote', Icon: Radio },
];

export default function Dashboard({ initialSites }: Props) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<DesktopTab>('Map');
  const [mobileTab, setMobileTab] = useState<MobileTab>('sites');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

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

  const handleMobileSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0f] text-slate-200 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d14] border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-xs font-bold shrink-0">DC</div>
          <span className="text-sm font-semibold text-white">DC Tracker</span>
          <span className="hidden sm:inline text-xs text-slate-600">Global Site Intelligence</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Panel toggle — collapses sidebar on desktop, filter bar on mobile */}
          <button
            onClick={() => setShowPanel(v => !v)}
            title={showPanel ? 'Hide panel' : 'Show panel'}
            className="flex items-center justify-center w-7 h-7 rounded text-slate-500 hover:text-white hover:bg-[#1a1a2e] transition-colors"
          >
            {showPanel ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          {/* Icon-only on mobile, text+icon on desktop */}
          <button onClick={seedDb} title="Seed DB"
            className="flex items-center gap-1.5 px-2 py-1.5 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-400 hover:text-white transition-colors">
            <Database size={13} />
            <span className="hidden sm:inline text-xs">Seed DB</span>
          </button>
          <button onClick={exportCSV} title="Export CSV"
            className="flex items-center gap-1.5 px-2 py-1.5 bg-[#1a1a2e] hover:bg-[#252540] border border-[#2d2d4e] rounded text-slate-400 hover:text-white transition-colors">
            <FileDown size={13} />
            <span className="hidden sm:inline text-xs">Export CSV</span>
          </button>
          {/* Desktop tab switcher — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 ml-1">
            {DESKTOP_TABS.map(t => (
              <button key={t}
                className={`text-xs px-3 py-1 rounded transition-colors ${rightTab === t ? 'bg-blue-700 text-white' : 'text-slate-500 hover:text-white'}`}
                onClick={() => setRightTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Bar */}
      <KPIBar sites={sites} filtered={filtered} />

      {/* ── MOBILE LAYOUT (hidden on md+) ── */}
      <div className="flex flex-col flex-1 overflow-hidden md:hidden">
        {/* Mobile content area */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {mobileTab === 'sites' && (
            <>
              {/* Filter bar + expandable panel — hidden when panel is collapsed via header toggle */}
              {showPanel && (
                <>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a2a] bg-[#0d0d14] shrink-0">
                    <span className="text-[11px] text-slate-500">{filtered.length} site{filtered.length !== 1 ? 's' : ''}</span>
                    <button
                      onClick={() => setShowMobileFilters(v => !v)}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${showMobileFilters ? 'bg-blue-700 border-blue-600 text-white' : 'border-[#2d2d4e] text-slate-400 hover:text-white'}`}
                    >
                      {showMobileFilters ? <X size={11} /> : <SlidersHorizontal size={11} />}
                      {showMobileFilters ? 'Close' : 'Filters'}
                    </button>
                  </div>
                  {showMobileFilters && (
                    <>
                      <div className="shrink-0 overflow-y-auto max-h-[40vh] border-b border-[#1e1e2e]">
                        <FilterPanel filters={filters} onChange={handleFilterChange} />
                      </div>
                      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-[#0d0d14] border-b border-[#1a1a2a]">
                        <span className="text-[11px] text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                        <button
                          onClick={() => setShowMobileFilters(false)}
                          className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                        >
                          Show results
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              <SiteList
                sites={filtered}
                selectedId={selectedId}
                onSelect={handleMobileSelect}
                onToggleWatchlist={handleToggleWatchlist}
              />
            </>
          )}
          {mobileTab === 'map' && (
            <MapView sites={filtered} selectedId={selectedId} onSelect={id => { setSelectedId(id); setMobileTab('sites'); }} />
          )}
          {mobileTab === 'signals' && <SignalFeed />}
          {mobileTab === 'ingest' && <IngestPanel />}
          {mobileTab === 'remote' && <RemoteControlPanel />}
        </div>

        {/* Bottom nav */}
        <nav className="flex items-center justify-around border-t border-[#1e1e2e] bg-[#0d0d14] shrink-0 py-1">
          {MOBILE_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setMobileTab(id)}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded transition-colors ${mobileTab === id ? 'text-blue-400' : 'text-slate-600 hover:text-slate-300'}`}
            >
              <Icon size={18} />
              <span className="text-[10px]">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Mobile site detail — full-screen overlay */}
      {selectedSite && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#0d0d14] flex flex-col">
          <SiteDetail
            site={selectedSite}
            onClose={() => setSelectedId(null)}
            onToggleWatchlist={handleToggleWatchlist}
            onSaveNotes={handleSaveNotes}
          />
        </div>
      )}

      {/* ── DESKTOP LAYOUT (hidden on mobile) ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left panel: filters + site list */}
        <div className={`flex flex-col shrink-0 border-r border-[#1e1e2e] overflow-hidden transition-all duration-200 ${showPanel ? 'w-[320px]' : 'w-0 border-r-0'}`}>
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

        {/* Center: map / signals / ingest / remote */}
        <div className="flex-1 overflow-hidden relative">
          {rightTab === 'Map' && (
            <MapView sites={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {rightTab === 'Signals' && <SignalFeed />}
          {rightTab === 'Ingest' && <IngestPanel />}
          {rightTab === 'Remote' && <RemoteControlPanel />}
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
