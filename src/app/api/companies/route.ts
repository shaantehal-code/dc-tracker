import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Known operators — keywords match against owner, tags (JSON), and name fields
const COMPANIES = [
  { name: 'Microsoft',        color: '#00a4ef', keywords: ['microsoft', 'msft', 'azure'] },
  { name: 'Amazon / AWS',     color: '#ff9900', keywords: ['amazon', 'aws', 'amzn'] },
  { name: 'Google / Alphabet',color: '#4285f4', keywords: ['google', 'alphabet', 'googl'] },
  { name: 'Meta',             color: '#0866ff', keywords: ['meta', 'facebook'] },
  { name: 'Apple',            color: '#888888', keywords: ['apple', 'aapl'] },
  { name: 'Nvidia',           color: '#76b900', keywords: ['nvidia', 'nvda'] },
  { name: 'Equinix',          color: '#e11d48', keywords: ['equinix', 'eqix'] },
  { name: 'Digital Realty',   color: '#3b82f6', keywords: ['digital realty', 'dlr', 'digitalrealty'] },
  { name: 'Iron Mountain',    color: '#f97316', keywords: ['iron mountain', 'ironmountain', 'irm'] },
  { name: 'CoreWeave',        color: '#8b5cf6', keywords: ['coreweave'] },
  { name: 'xAI',              color: '#f1f5f9', keywords: ['xai', 'x.ai', 'grok'] },
  { name: 'CyrusOne',         color: '#06b6d4', keywords: ['cyrusone'] },
  { name: 'QTS',              color: '#f59e0b', keywords: ['qts', 'quantum technology solutions'] },
  { name: 'Vantage DC',       color: '#10b981', keywords: ['vantage'] },
  { name: 'DataBank',         color: '#a855f7', keywords: ['databank'] },
  { name: 'NTT Global',       color: '#dc2626', keywords: ['ntt'] },
  { name: 'Applied Digital',  color: '#0ea5e9', keywords: ['applied digital', 'apld'] },
  { name: 'Aligned DC',       color: '#84cc16', keywords: ['aligned'] },
  { name: 'Stack Infrastructure', color: '#64748b', keywords: ['stack infrastructure', 'stack infra'] },
  { name: 'Talen Energy',     color: '#7c3aed', keywords: ['talen'] },
];

function buildLikeClause(keyword: string): string {
  const k = keyword.toLowerCase();
  return `LOWER(s.owner) LIKE '%${k}%' OR LOWER(s.tags) LIKE '%${k}%' OR LOWER(s.name) LIKE '%${k}%'`;
}

export function GET() {
  try {
    const db = getDb();
    const results = [];

    for (const company of COMPANIES) {
      const whereClause = company.keywords.map(buildLikeClause).join(' OR ');

      const row = db.prepare(`
        SELECT
          COUNT(DISTINCT s.id)               AS site_count,
          COALESCE(SUM(s.power_capacity_mw), 0) AS total_mw,
          COALESCE(ROUND(AVG(s.opportunity_score)), 0) AS avg_score,
          COALESCE(MAX(s.opportunity_score), 0)  AS top_score,
          COALESCE(MAX(s.country), '')           AS primary_country
        FROM sites s
        WHERE ${whereClause}
      `).get() as any;

      if (!row || row.site_count === 0) continue;

      const sigs = db.prepare(`
        SELECT sig.type, sig.date, sig.description, sig.confidence, si.name AS site_name
        FROM signals sig
        JOIN sites si ON sig.site_id = si.id
        WHERE (${whereClause.replace(/s\./g, 'si.')})
          AND sig.date >= date('now', '-30 days')
        ORDER BY sig.date DESC
        LIMIT 1
      `).get() as any;

      const signals30d = (db.prepare(`
        SELECT COUNT(*) AS n FROM signals sig
        JOIN sites si ON sig.site_id = si.id
        WHERE (${whereClause.replace(/s\./g, 'si.')})
          AND sig.date >= date('now', '-30 days')
      `).get() as any).n as number;

      const sites = db.prepare(`
        SELECT id, name, region, opportunity_score, power_capacity_mw
        FROM sites s
        WHERE ${whereClause}
        ORDER BY opportunity_score DESC
        LIMIT 5
      `).all() as any[];

      results.push({
        name:          company.name,
        color:         company.color,
        siteCount:     row.site_count,
        totalMW:       Math.round(row.total_mw),
        avgScore:      row.avg_score,
        topScore:      row.top_score,
        signals30d,
        latestSignal:  sigs ? { date: sigs.date, type: sigs.type, description: sigs.description?.slice(0, 100), site: sigs.site_name } : null,
        topSites:      sites,
        searchKeyword: company.keywords[0],
      });
    }

    // Sort by total MW descending
    results.sort((a, b) => b.totalMW - a.totalMW);

    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
