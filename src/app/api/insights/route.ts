import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const db = getDb();

    const totalSites = (db.prepare('SELECT COUNT(*) as n FROM sites').get() as any).n as number;
    const totalSignals = (db.prepare('SELECT COUNT(*) as n FROM signals').get() as any).n as number;
    const signals7d = (db.prepare("SELECT COUNT(*) as n FROM signals WHERE date >= date('now','-7 days')").get() as any).n as number;
    const totalMW = ((db.prepare('SELECT SUM(power_capacity_mw) as mw FROM sites').get() as any).mw as number) || 0;

    const byType = db.prepare(`
      SELECT type, COUNT(*) as count FROM signals
      WHERE date >= date('now','-90 days')
      GROUP BY type ORDER BY count DESC
    `).all() as { type: string; count: number }[];

    const byDay = db.prepare(`
      SELECT date, COUNT(*) as count FROM signals
      WHERE date >= date('now','-30 days')
      GROUP BY date ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    const scoreDistribution = db.prepare(`
      SELECT
        CASE
          WHEN opportunity_score >= 90 THEN '90–100'
          WHEN opportunity_score >= 80 THEN '80–89'
          WHEN opportunity_score >= 70 THEN '70–79'
          WHEN opportunity_score >= 60 THEN '60–69'
          WHEN opportunity_score >= 50 THEN '50–59'
          ELSE 'Below 50'
        END as bucket,
        COUNT(*) as count
      FROM sites
      GROUP BY bucket
      ORDER BY MIN(opportunity_score) DESC
    `).all() as { bucket: string; count: number }[];

    const topSites = db.prepare(`
      SELECT s.id, s.name, s.opportunity_score, s.region, COUNT(sig.id) as signal_count
      FROM sites s
      LEFT JOIN signals sig ON sig.site_id = s.id AND sig.date >= date('now','-30 days')
      GROUP BY s.id
      HAVING signal_count > 0
      ORDER BY signal_count DESC, s.opportunity_score DESC
      LIMIT 10
    `).all() as { id: string; name: string; opportunity_score: number; region: string; signal_count: number }[];

    const velocityLeaders = db.prepare(`
      SELECT s.id, s.name, s.opportunity_score, COUNT(sig.id) as hc_signals
      FROM sites s
      LEFT JOIN signals sig ON sig.site_id = s.id
        AND sig.confidence = 'high'
        AND sig.date >= date('now','-30 days')
      GROUP BY s.id
      HAVING hc_signals > 0
      ORDER BY hc_signals DESC
      LIMIT 5
    `).all() as { id: string; name: string; opportunity_score: number; hc_signals: number }[];

    const byRegion = db.prepare(`
      SELECT s.region, COUNT(sig.id) as count
      FROM sites s
      LEFT JOIN signals sig ON sig.site_id = s.id
      GROUP BY s.region
      ORDER BY count DESC
    `).all() as { region: string; count: number }[];

    return NextResponse.json({
      stats: { totalSites, totalSignals, signals7d, totalGW: (totalMW / 1000).toFixed(1) },
      byType,
      byDay,
      scoreDistribution,
      topSites,
      velocityLeaders,
      byRegion,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
