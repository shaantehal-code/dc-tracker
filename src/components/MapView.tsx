'use client';

import { useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { Site } from '@/types';

interface Props {
  sites: Site[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function scoreColor(s: number) {
  if (s >= 90) return '#22c55e';
  if (s >= 75) return '#84cc16';
  if (s >= 60) return '#f59e0b';
  if (s >= 45) return '#f97316';
  return '#ef4444';
}

const LEGEND = [
  { color: '#22c55e', label: '90+ · exceptional' },
  { color: '#84cc16', label: '75–89 · strong' },
  { color: '#f59e0b', label: '60–74 · moderate' },
  { color: '#f97316', label: '45–59 · watch' },
  { color: '#ef4444', label: 'under 45 · low' },
];

export default function MapView({ sites, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const sitesRef = useRef<Site[]>(sites);
  const hasFitRef = useRef(false);

  // Keep a live ref to the current sites so imperative controls (e.g. Fit button) always use fresh data
  sitesRef.current = sites;

  function fitToResults() {
    const map = mapRef.current;
    const L = LRef.current;
    const list = sitesRef.current;
    if (!map || !L || list.length === 0) return;
    const bounds = L.latLngBounds(list.map(s => [s.lat, s.lng] as [number, number]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 7, animate: true });
    }
  }

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import('leaflet').then(mod => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const L = mod.default;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        center: [30, 0],
        zoom: 2,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; Carto',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Force Leaflet to recalculate container size after layout settles
      setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 100);
      setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 500);

      // Also watch for container resize (e.g. side panel opening/closing)
      const ro = new ResizeObserver(() => map.invalidateSize());
      if (containerRef.current) ro.observe(containerRef.current);
      (map as any)._resizeObserver = ro;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as any)._resizeObserver?.disconnect();
        mapRef.current.remove();
        mapRef.current = null;
        LRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  // Re-render markers whenever sites or selectedId change
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();

    sites.forEach(site => {
      const color = scoreColor(site.opportunityScore);
      const radius = Math.max(6, Math.min(22, 6 + site.powerCapacityMW / 120));
      const isSelected = site.id === selectedId;

      const marker = L.circleMarker([site.lat, site.lng], {
        radius,
        fillColor: color,
        color: isSelected ? '#fff' : '#000',
        weight: isSelected ? 2 : 1,
        opacity: 0.9,
        fillOpacity: isSelected ? 1 : 0.75,
        className: isSelected ? 'marker-selected' : '',
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:system-ui;min-width:190px">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${site.name}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${site.city}, ${site.country}</div>
          <div style="display:flex;gap:12px;font-size:12px">
            <span style="color:${color};font-weight:700">${site.opportunityScore}/100</span>
            <span>${site.powerCapacityMW} MW</span>
            <span>${site.landAcres.toLocaleString()} ac</span>
          </div>
          <div style="margin-top:4px;font-size:11px;color:#64748b">${site.type.replace(/_/g,' ')} · ${site.status.replace(/_/g,' ')}</div>
          ${site.owner ? `<div style="margin-top:4px;font-size:11px;color:#64748b">🏢 ${site.owner.split('(')[0].trim()}</div>` : ''}
          <div style="margin-top:6px;font-size:10px;color:#3b82f6">Click marker to open full details →</div>
        </div>
      `);

      marker.on('click', () => onSelect(site.id));
      markersRef.current.set(site.id, marker);
    });

    // On first render with data, frame the map to the visible sites instead of the empty ocean
    if (!hasFitRef.current && sites.length > 0) {
      hasFitRef.current = true;
      const bounds = L.latLngBounds(sites.map(s => [s.lat, s.lng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 6, animate: false });
    }
  }, [sites, selectedId, onSelect]);

  // Pan to selected site
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const site = sites.find(s => s.id === selectedId);
    if (site) {
      map.setView([site.lat, site.lng], Math.max(map.getZoom(), 7), { animate: true });
    }
  }, [selectedId, sites]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Fit-to-results control */}
      <button
        onClick={fitToResults}
        title="Zoom to fit all visible sites"
        className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0d0d14]/90 hover:bg-[#1a1a2e] border border-[#2d2d4e] rounded text-[11px] text-slate-300 hover:text-white backdrop-blur transition-colors shadow-lg"
      >
        <Maximize2 size={12} />
        Fit
      </button>

      {/* Legend */}
      <div className="absolute bottom-4 left-3 z-[1000] bg-[#0d0d14]/90 border border-[#2d2d4e] rounded-lg px-3 py-2.5 backdrop-blur shadow-lg pointer-events-none">
        <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Opportunity Score</div>
        <div className="flex flex-col gap-1">
          {LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{l.label}</span>
            </div>
          ))}
        </div>
        <div className="text-[9px] text-slate-600 mt-1.5 pt-1.5 border-t border-[#1e1e2e]">◯ larger = more MW</div>
      </div>
    </div>
  );
}
