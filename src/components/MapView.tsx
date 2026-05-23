'use client';

import { useEffect, useRef } from 'react';
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

export default function MapView({ sites, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

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
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:system-ui;min-width:180px">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${site.name}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${site.city}, ${site.country}</div>
          <div style="display:flex;gap:12px;font-size:12px">
            <span style="color:${color};font-weight:700">${site.opportunityScore}/100</span>
            <span>${site.powerCapacityMW} MW</span>
            <span>${site.landAcres.toLocaleString()} ac</span>
          </div>
          <div style="margin-top:4px;font-size:11px;color:#64748b">${site.type.replace(/_/g,' ')} · ${site.status.replace(/_/g,' ')}</div>
        </div>
      `);

      marker.on('click', () => onSelect(site.id));
      markersRef.current.set(site.id, marker);
    });
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
    </div>
  );
}
