'use client';

import { FilterState } from '@/types';
import { X } from 'lucide-react';

interface Props {
  filters: FilterState;
  onChange: (f: Partial<FilterState>) => void;
}

const REGIONS = ['','northeast','southeast','midwest','southwest','mountain','northwest','canada','europe','apac','latam','mena'];
const TYPES = ['','greenfield','existing_dc','industrial_conversion','power_plant','partner'];
const STATUSES = ['','available','announced','under_construction','in_permitting','operational','for_sale','emerging'];
const SORTS = [
  { value: 'score', label: 'Score' },
  { value: 'power', label: 'Power' },
  { value: 'land', label: 'Land' },
  { value: 'cost', label: 'Cost' },
  { value: 'name', label: 'Name' },
];

export default function FilterPanel({ filters, onChange }: Props) {
  const sel = 'bg-[#1a1a2e] border border-[#2d2d4e] rounded text-sm text-slate-300 px-2 py-1 w-full focus:outline-none focus:border-blue-500';
  const inp = sel + ' placeholder-slate-600';

  return (
    <div className="p-3 border-b border-[#1e1e2e] bg-[#0d0d14] flex flex-col gap-2 shrink-0">
      <div className="flex gap-2">
        <input
          className={inp + ' flex-1'}
          placeholder="Search sites, cities, tags..."
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
        />
        <button
          className="px-2 py-1 text-slate-500 hover:text-white"
          onClick={() => onChange({ search: '', region: '', type: '', status: '', country: '', minScore: 0, minPower: 0, minLand: 0, maxPowerCost: 200, watchlistOnly: false, sort: 'score' })}
          title="Reset filters"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select className={sel} value={filters.region} onChange={e => onChange({ region: e.target.value })}>
          {REGIONS.map(r => <option key={r} value={r}>{r || 'All Regions'}</option>)}
        </select>
        <select className={sel} value={filters.type} onChange={e => onChange({ type: e.target.value })}>
          {TYPES.map(t => <option key={t} value={t}>{t ? t.replace(/_/g,' ') : 'All Types'}</option>)}
        </select>
        <select className={sel} value={filters.status} onChange={e => onChange({ status: e.target.value })}>
          {STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g,' ') : 'All Statuses'}</option>)}
        </select>
        <input
          className={inp}
          placeholder="Country (US, DE, JP...)"
          value={filters.country}
          onChange={e => onChange({ country: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
        <label className="flex flex-col gap-1">
          Min Score: <span className="text-white">{filters.minScore}</span>
          <input type="range" min={0} max={100} value={filters.minScore}
            onChange={e => onChange({ minScore: +e.target.value })}
            className="w-full accent-blue-500" />
        </label>
        <label className="flex flex-col gap-1">
          Min Power: <span className="text-white">{filters.minPower} MW</span>
          <input type="range" min={0} max={2000} step={50} value={filters.minPower}
            onChange={e => onChange({ minPower: +e.target.value })}
            className="w-full accent-blue-500" />
        </label>
        <label className="flex flex-col gap-1">
          Min Land: <span className="text-white">{filters.minLand} ac</span>
          <input type="range" min={0} max={5000} step={100} value={filters.minLand}
            onChange={e => onChange({ minLand: +e.target.value })}
            className="w-full accent-blue-500" />
        </label>
        <label className="flex flex-col gap-1">
          Max $/MWh: <span className="text-white">{filters.maxPowerCost}</span>
          <input type="range" min={20} max={200} step={5} value={filters.maxPowerCost}
            onChange={e => onChange({ maxPowerCost: +e.target.value })}
            className="w-full accent-blue-500" />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={filters.watchlistOnly}
            onChange={e => onChange({ watchlistOnly: e.target.checked })}
            className="accent-amber-400" />
          Watchlist only
        </label>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          Sort:
          {SORTS.map(s => (
            <button key={s.value}
              className={`px-2 py-0.5 rounded ${filters.sort === s.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              onClick={() => onChange({ sort: s.value as FilterState['sort'] })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
