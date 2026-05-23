'use client';

import { Site } from '@/types';
import { X, Star, ExternalLink, Zap, Layers, Droplets, Wifi, DollarSign } from 'lucide-react';
import { useState } from 'react';

interface Props {
  site: Site;
  onClose: () => void;
  onToggleWatchlist: (id: string) => void;
  onSaveNotes: (id: string, notes: string) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#1a1a2e] text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 text-right max-w-[60%]">{value}</span>
    </div>
  );
}

const CONF_COLOR: Record<string,string> = { high: 'text-green-400', medium: 'text-yellow-400', low: 'text-slate-500' };
const SIG_ICON: Record<string,string> = {
  interconnection_request: '⚡', building_permit: '🏗', water_permit: '💧',
  zoning_change: '📋', news: '📰', sec_filing: '📄', job_posting: '👔',
  land_sale: '🏞', satellite_change: '🛰', power_plant_retirement: '🔌', partner_announcement: '🤝',
};

export default function SiteDetail({ site, onClose, onToggleWatchlist, onSaveNotes }: Props) {
  const [notes, setNotes] = useState(site.userNotes || '');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSaveNotes(site.id, notes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d14]">
      <div className="flex items-start justify-between p-3 border-b border-[#1e1e2e]">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-white truncate">{site.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{site.city}{site.state ? `, ${site.state}` : ''}, {site.country}</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <button onClick={() => onToggleWatchlist(site.id)} className={site.watchlisted ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}>
            <Star size={16} fill={site.watchlisted ? 'currentColor' : 'none'} />
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 px-3 pb-3">
        <div className="mt-2">
          <Row label="Type" value={site.type.replace(/_/g,' ')} />
          <Row label="Status" value={site.status.replace(/_/g,' ')} />
          <Row label="Opportunity Score" value={<span className="font-bold text-lg" style={{color: site.opportunityScore>=80?'#22c55e':site.opportunityScore>=60?'#f59e0b':'#ef4444'}}>{site.opportunityScore}/100</span>} />
          <Row label="Power Capacity" value={`${site.powerCapacityMW} MW`} />
          <Row label="Power Available" value={`${site.powerAvailableMW} MW`} />
          <Row label="Land" value={`${site.landAcres.toLocaleString()} acres`} />
          <Row label="Fiber" value={site.fiberAccess} />
          <Row label="Water" value={site.waterAccess} />
          <Row label="Power Cost" value={`$${site.powerCostPerMWh}/MWh`} />
          <Row label="PUE Estimate" value={site.pueEstimate} />
          {site.askingPriceMUSD && <Row label="Asking Price" value={`$${site.askingPriceMUSD}M USD`} />}
          <Row label="Region" value={site.region} />
          <Row label="Coordinates" value={`${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}`} />
        </div>

        {site.tags.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] text-slate-500 uppercase mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {site.tags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 bg-[#1a1a2e] rounded-full text-slate-400">{t}</span>
              ))}
            </div>
          </div>
        )}

        {site.notes && (
          <div className="mt-3">
            <div className="text-[11px] text-slate-500 uppercase mb-1">Notes</div>
            <p className="text-xs text-slate-400 leading-relaxed">{site.notes}</p>
          </div>
        )}

        {(site.signals?.length ?? 0) > 0 && (
          <div className="mt-3">
            <div className="text-[11px] text-slate-500 uppercase mb-2">Signals ({site.signals!.length})</div>
            <div className="flex flex-col gap-2">
              {site.signals!.map(sig => (
                <div key={sig.id} className="bg-[#111118] rounded p-2 border border-[#1e1e2e]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-300">
                      {SIG_ICON[sig.type] || '📌'} {sig.type.replace(/_/g,' ')}
                    </span>
                    <span className={`text-[10px] ${CONF_COLOR[sig.confidence]}`}>{sig.confidence}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">{sig.description}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-600">{sig.date}</span>
                    {sig.sourceUrl && (
                      <a href={sig.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 flex items-center gap-0.5 hover:text-blue-400">
                        Source <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3">
          <div className="text-[11px] text-slate-500 uppercase mb-1">Your Notes</div>
          <textarea
            className="w-full bg-[#111118] border border-[#2d2d4e] rounded text-xs text-slate-300 p-2 resize-none focus:outline-none focus:border-blue-500 placeholder-slate-700"
            rows={4}
            placeholder="Add private notes about this site..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <button
            onClick={handleSave}
            className={`mt-1 w-full py-1.5 rounded text-xs font-medium transition-colors ${saved ? 'bg-green-700 text-white' : 'bg-blue-700 hover:bg-blue-600 text-white'}`}
          >
            {saved ? '✓ Saved' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
}
