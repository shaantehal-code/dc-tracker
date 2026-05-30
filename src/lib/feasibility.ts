import { Site, Signal } from '@/types';

// LBNL 2024 queue completion data — baseline interconnection timelines by ISO
const ISO_PROFILE: Record<string, { lo: number; hi: number; congestion: number; label: string }> = {
  ercot:   { lo: 24, hi: 36, congestion: 3, label: 'ERCOT (TX)' },
  nyiso:   { lo: 30, hi: 42, congestion: 4, label: 'NYISO (NY)' },
  iso_ne:  { lo: 30, hi: 42, congestion: 4, label: 'ISO-NE (New England)' },
  pjm:     { lo: 36, hi: 54, congestion: 6, label: 'PJM (Mid-Atlantic)' },
  spp:     { lo: 30, hi: 48, congestion: 5, label: 'SPP (Central US)' },
  miso:    { lo: 42, hi: 60, congestion: 7, label: 'MISO (Midwest)' },
  wecc:    { lo: 30, hi: 48, congestion: 5, label: 'WECC (West)' },
  caiso:   { lo: 36, hi: 54, congestion: 6, label: 'CAISO (CA)' },
  default: { lo: 28, hi: 48, congestion: 5, label: 'Regional grid' },
};

const REGION_TO_ISO: Record<string, string> = {
  northeast: 'pjm',
  southeast: 'pjm',
  midwest:   'miso',
  southwest: 'ercot',
  mountain:  'spp',
  northwest: 'wecc',
  canada:    'default',
  europe:    'default',
  apac:      'default',
  latam:     'default',
  mena:      'default',
};

export interface FeasibilityResult {
  score: number;
  monthsLow: number;
  monthsHigh: number;
  isoLabel: string;
  factors: { label: string; impact: 'positive' | 'neutral' | 'negative' }[];
}

export function computeFeasibility(site: Site, signals: Signal[]): FeasibilityResult {
  const isoKey = REGION_TO_ISO[site.region] || 'default';
  const profile = ISO_PROFILE[isoKey];

  let lo = profile.lo;
  let hi = profile.hi;
  const factors: FeasibilityResult['factors'] = [];

  // Site type
  if (site.type === 'power_plant') {
    lo -= 12; hi -= 12;
    factors.push({ label: 'Power plant — existing substation connection', impact: 'positive' });
  } else if (site.type === 'industrial_conversion') {
    lo -= 6; hi -= 6;
    factors.push({ label: 'Industrial conversion — partial infrastructure', impact: 'positive' });
  } else if (site.type === 'greenfield') {
    factors.push({ label: 'Greenfield — full new interconnection required', impact: 'negative' });
  } else {
    factors.push({ label: `${site.type.replace(/_/g, ' ')} site`, impact: 'neutral' });
  }

  // Power scale
  if (site.powerCapacityMW >= 500) {
    lo += 12; hi += 12;
    factors.push({ label: `${site.powerCapacityMW} MW — large load triggers complex cluster study`, impact: 'negative' });
  } else if (site.powerCapacityMW >= 200) {
    lo += 6; hi += 6;
    factors.push({ label: `${site.powerCapacityMW} MW — medium load`, impact: 'neutral' });
  } else {
    factors.push({ label: `${site.powerCapacityMW} MW — smaller load, simpler study`, impact: 'positive' });
  }

  // Signal evidence of active queue position
  const ixCount = signals.filter(s => s.type === 'interconnection_request').length;
  if (ixCount >= 2) {
    lo -= 6; hi -= 6;
    factors.push({ label: `${ixCount} interconnection signals — queue activity detected`, impact: 'positive' });
  } else if (ixCount === 1) {
    factors.push({ label: '1 interconnection signal on record', impact: 'positive' });
  }

  // ISO congestion context
  const congLabel = profile.congestion <= 4 ? 'low congestion' : profile.congestion <= 6 ? 'moderate congestion' : 'high congestion';
  factors.push({
    label: `${profile.label} — ${congLabel}`,
    impact: profile.congestion <= 4 ? 'positive' : profile.congestion <= 6 ? 'neutral' : 'negative',
  });

  lo = Math.max(12, lo);
  hi = Math.max(lo + 6, hi);

  // Score: 100 = fastest/easiest, 0 = slowest/hardest
  const timeScore = Math.max(0, 100 - (lo - 12) * 1.4);
  const congScore = Math.max(0, 100 - profile.congestion * 8);
  const score = Math.min(100, Math.max(0, Math.round(timeScore * 0.6 + congScore * 0.4)));

  return { score, monthsLow: lo, monthsHigh: hi, isoLabel: profile.label, factors };
}
