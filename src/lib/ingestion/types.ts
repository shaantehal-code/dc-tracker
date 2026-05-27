export type SignalType =
  | 'interconnection_request'
  | 'building_permit'
  | 'water_permit'
  | 'zoning_change'
  | 'news'
  | 'sec_filing'
  | 'job_posting'
  | 'land_sale'
  | 'satellite_change'
  | 'power_plant_retirement'
  | 'partner_announcement';

export interface RawSignal {
  siteId: string;
  type: SignalType;
  date: string;
  description: string;
  sourceUrl?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface IngestionResult {
  source: string;
  label: string;
  signalsFound: number;
  signalsNew: number;
  error?: string;
  durationMs: number;
}

export interface SiteStub {
  id: string;
  name: string;
  city: string;
  state?: string | null;
  country: string;
  owner?: string | null;
  tags: string[];
  notes: string;
  region: string;
}
