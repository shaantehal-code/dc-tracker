'use client';

import { Site } from '@/types';

interface Props {
  sites: Site[];
  filtered: Site[];
}

export default function KPIBar({ sites, filtered }: Props) {
  const totalPower = filtered.reduce((s, x) => s + (x.powerCapacityMW || 0), 0);
  const avgScore = filtered.length ? Math.round(filtered.reduce((s, x) => s + x.opportunityScore, 0) / filtered.length) : 0;
  const greenfield = filtered.filter(s => s.type === 'greenfield').length;
  const watchlisted = sites.filter(s => s.watchlisted).length;
  const highScore = filtered.filter(s => s.opportunityScore >= 80).length;

  const kpis = [
    { label: 'Sites Shown', value: filtered.length, sub: `of ${sites.length} total` },
    { label: 'Total Power', value: `${(totalPower / 1000).toFixed(1)} GW`, sub: 'filtered capacity' },
    { label: 'Avg Score', value: avgScore, sub: 'opportunity score' },
    { label: 'High Priority', value: highScore, sub: 'score ≥ 80' },
    { label: 'Greenfield', value: greenfield, sub: 'of filtered' },
    { label: 'Watchlisted', value: watchlisted, sub: 'across all sites' },
  ];

  return (
    <div className="flex gap-3 px-3 py-2 bg-[#0d0d14] border-b border-[#1e1e2e] overflow-x-auto shrink-0 scrollbar-none">
      {kpis.map(k => (
        <div key={k.label} className="flex flex-col min-w-[80px] shrink-0">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider whitespace-nowrap">{k.label}</span>
          <span className="text-base font-bold text-white leading-tight">{k.value}</span>
          <span className="text-[9px] text-slate-600 whitespace-nowrap">{k.sub}</span>
        </div>
      ))}
    </div>
  );
}
