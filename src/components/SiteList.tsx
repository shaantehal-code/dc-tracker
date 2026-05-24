'use client';

import { Site } from '@/types';
import { Star, Zap, MapPin } from 'lucide-react';

interface Props {
  sites: Site[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleWatchlist: (id: string) => void;
}

function scoreColor(s: number) {
  if (s >= 90) return '#22c55e';
  if (s >= 75) return '#84cc16';
  if (s >= 60) return '#f59e0b';
  if (s >= 45) return '#f97316';
  return '#ef4444';
}

function statusBadge(s: string) {
  const map: Record<string,string> = {
    available: 'bg-green-900/40 text-green-400',
    announced: 'bg-blue-900/40 text-blue-400',
    under_construction: 'bg-yellow-900/40 text-yellow-400',
    in_permitting: 'bg-purple-900/40 text-purple-400',
    operational: 'bg-cyan-900/40 text-cyan-400',
    for_sale: 'bg-orange-900/40 text-orange-400',
    emerging: 'bg-pink-900/40 text-pink-400',
  };
  return map[s] || 'bg-slate-800 text-slate-400';
}

export default function SiteList({ sites, selectedId, onSelect, onToggleWatchlist }: Props) {
  if (sites.length === 0) {
    return <div className="p-4 text-slate-500 text-sm text-center">No sites match your filters.</div>;
  }

  return (
    <div className="overflow-y-auto flex-1">
      {sites.map(site => (
        <div
          key={site.id}
          className={`p-3 border-b border-[#1a1a2a] cursor-pointer hover:bg-[#141420] transition-colors ${selectedId === site.id ? 'bg-[#151525] border-l-2 border-l-blue-500' : ''}`}
          onClick={() => onSelect(site.id)}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: scoreColor(site.opportunityScore) }}
                />
                <span className="text-sm font-medium text-white truncate">{site.name}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500">
                <MapPin size={10} />
                <span>{site.city}{site.state ? `, ${site.state}` : ''}, {site.country}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold" style={{ color: scoreColor(site.opportunityScore) }}>
                  {site.opportunityScore}
                </span>
                <button
                  className={`p-0.5 ${site.watchlisted ? 'text-amber-400' : 'text-slate-700 hover:text-slate-400'}`}
                  onClick={e => { e.stopPropagation(); onToggleWatchlist(site.id); }}
                >
                  <Star size={12} fill={site.watchlisted ? 'currentColor' : 'none'} />
                </button>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadge(site.status)}`}>
                {site.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-0.5">
              <Zap size={10} className="text-yellow-500" />
              {site.powerCapacityMW} MW
            </span>
            <span>{site.landAcres.toLocaleString()} ac</span>
            <span className="text-slate-600">{site.type.replace(/_/g,' ')}</span>
            {(site.signals?.length ?? 0) > 0 && (
              <span className="text-blue-500">{site.signals!.length} signal{site.signals!.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          {site.owner && (
            <div className="mt-1 text-[10px] text-slate-600 truncate" title={site.owner}>
              🏢 {site.owner.split('(')[0].trim()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
