import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  try {
    const { messages } = await req.json();
    const db = getDb();

    // Compact site context — top 50 by score
    const sites = db.prepare(`
      SELECT id, name, type, status, power_capacity_mw, land_acres,
             opportunity_score, region, country, state, city,
             power_cost_per_mwh, pue_estimate, owner
      FROM sites
      ORDER BY opportunity_score DESC
      LIMIT 50
    `).all() as any[];

    // Recent signal activity — last 100
    const signals = db.prepare(`
      SELECT sig.type, sig.date, sig.confidence, sig.description,
             si.name as site_name, si.region
      FROM signals sig
      JOIN sites si ON sig.site_id = si.id
      ORDER BY sig.date DESC, sig.created_at DESC
      LIMIT 100
    `).all() as any[];

    const siteSummary = sites.map(s =>
      `${s.name} | ${s.city}${s.state ? `, ${s.state}` : ''}, ${s.country} | ${s.region} | ${s.type} | ${s.status} | score=${s.opportunity_score} | ${s.power_capacity_mw}MW | ${s.land_acres}ac | $${s.power_cost_per_mwh}/MWh | PUE=${s.pue_estimate}${s.owner ? ` | owner=${s.owner}` : ''}`
    ).join('\n');

    const signalSummary = signals.map(s =>
      `[${s.date}] ${s.site_name} (${s.region}) — ${s.type} [${s.confidence}]: ${s.description.slice(0, 120)}`
    ).join('\n');

    const systemPrompt = `You are an AI assistant embedded in DC Tracker, a private data center site acquisition intelligence platform. You help site selectors, infrastructure investors, and hyperscaler teams find, evaluate, and track data center development sites globally.

You have real-time access to the DC Tracker database. Use this data to answer questions with specifics — don't guess or hallucinate site details.

## Top 50 Sites by Opportunity Score
${siteSummary}

## Last 100 Signals (newest first)
${signalSummary}

Guidelines:
- Answer concisely and data-driven. Reference real sites and signals by name.
- For site comparisons or rankings, use the data above.
- For questions about grid/interconnection policy, FERC, ISO queue dynamics, or power markets, draw on your general knowledge AND connect it to the specific sites/regions above.
- Format lists and tables clearly. Keep answers under 400 words unless the user asks for detail.
- If a site or signal isn't in the data above, say so — don't invent details.`;

    const anthropic = new Anthropic({ apiKey });

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: (messages as any[]).slice(-10),
    });

    const readable = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        stream
          .on('text', (text) => controller.enqueue(enc.encode(text)))
          .on('finalMessage', () => controller.close())
          .on('error', (e) => controller.error(e));
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
