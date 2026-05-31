import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// SQL injection guard — block destructive statements in tool-generated WHERE clauses
function sanitizeClause(clause: string): string {
  const forbidden = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|EXEC|EXECUTE|TRUNCATE|GRANT|REVOKE)\b/i;
  return forbidden.test(clause) ? '1=0' : clause;
}

const DB_TOOLS: Anthropic.Tool[] = [
  {
    name: 'query_sites',
    description: 'Query DC Tracker sites from the database. Use when the user asks about specific site criteria (region, country, score threshold, power, cost, owner, type, status). Returns formatted site list.',
    input_schema: {
      type: 'object',
      properties: {
        where_clause: {
          type: 'string',
          description: 'SQL WHERE clause (no WHERE keyword). Columns: id, name, city, state, country, region, type, status, opportunity_score, power_capacity_mw, power_available_mw, land_acres, power_cost_per_mwh, pue_estimate, owner, watchlisted. Example: "region = \'northeast\' AND opportunity_score >= 70"',
        },
        order_by: {
          type: 'string',
          description: 'ORDER BY clause. Default: opportunity_score DESC',
        },
        limit: { type: 'number', description: 'Max rows. Default 20, max 100.' },
      },
    },
  },
  {
    name: 'query_signals',
    description: 'Query market intelligence signals with optional filters. Use for questions about recent signals, signal types, or activity for specific sites/regions.',
    input_schema: {
      type: 'object',
      properties: {
        where_clause: {
          type: 'string',
          description: 'SQL WHERE clause. Aliases: sig (signals table), si (sites table). Columns: sig.type, sig.date, sig.confidence, sig.description, si.name, si.region, si.country. Example: "si.region = \'northeast\' AND sig.date >= date(\'now\', \'-30 days\')"',
        },
        limit: { type: 'number', description: 'Max rows. Default 20, max 100.' },
      },
    },
  },
  {
    name: 'aggregate_sites',
    description: 'Compute aggregate stats on sites grouped by a dimension. Use for "how many X", "total MW by region", "average score by type" questions.',
    input_schema: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['region', 'type', 'status', 'country'],
          description: 'Dimension to group by',
        },
        metric: {
          type: 'string',
          enum: ['count', 'avg_score', 'total_mw', 'avg_cost'],
          description: 'Metric to compute per group',
        },
      },
      required: ['group_by', 'metric'],
    },
  },
];

function executeTool(db: ReturnType<typeof getDb>, name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'query_sites': {
        const where = input.where_clause ? `WHERE ${sanitizeClause(String(input.where_clause))}` : '';
        const order = input.order_by ? sanitizeClause(String(input.order_by)) : 'opportunity_score DESC';
        const limit = Math.min(Number(input.limit) || 20, 100);
        const rows = db.prepare(`
          SELECT name, city, state, country, region, type, status,
                 opportunity_score, power_capacity_mw, land_acres,
                 power_cost_per_mwh, pue_estimate, owner
          FROM sites ${where} ORDER BY ${order} LIMIT ${limit}
        `).all() as any[];
        if (rows.length === 0) return 'No sites match those criteria.';
        return rows.map((s: any) =>
          `${s.name} | ${s.city}${s.state ? `, ${s.state}` : ''}, ${s.country} | ${s.region} | ${s.type} | ${s.status} | score=${s.opportunity_score} | ${s.power_capacity_mw}MW | $${s.power_cost_per_mwh}/MWh | PUE=${s.pue_estimate}${s.owner ? ` | owner=${s.owner}` : ''}`
        ).join('\n');
      }
      case 'query_signals': {
        const where = input.where_clause ? `AND ${sanitizeClause(String(input.where_clause))}` : '';
        const limit = Math.min(Number(input.limit) || 20, 100);
        const rows = db.prepare(`
          SELECT sig.type, sig.date, sig.confidence, sig.description,
                 si.name AS site_name, si.region
          FROM signals sig
          JOIN sites si ON sig.site_id = si.id
          WHERE 1=1 ${where}
          ORDER BY sig.date DESC, sig.created_at DESC LIMIT ${limit}
        `).all() as any[];
        if (rows.length === 0) return 'No signals match those criteria.';
        return rows.map((s: any) =>
          `[${s.date}] ${s.site_name} (${s.region}) — ${s.type} [${s.confidence}]: ${String(s.description).slice(0, 150)}`
        ).join('\n');
      }
      case 'aggregate_sites': {
        const safeCol = ['region', 'type', 'status', 'country'].includes(String(input.group_by))
          ? String(input.group_by) : 'region';
        const metricMap: Record<string, string> = {
          count: 'COUNT(*)',
          avg_score: 'ROUND(AVG(opportunity_score))',
          total_mw: 'ROUND(SUM(power_capacity_mw))',
          avg_cost: 'ROUND(AVG(power_cost_per_mwh), 2)',
        };
        const metric = metricMap[String(input.metric)] ?? 'COUNT(*)';
        const rows = db.prepare(`
          SELECT ${safeCol} AS grp, ${metric} AS value
          FROM sites GROUP BY ${safeCol} ORDER BY value DESC
        `).all() as any[];
        return rows.map((r: any) => `${r.grp}: ${r.value}`).join('\n');
      }
      default:
        return 'Unknown tool';
    }
  } catch (e: any) {
    return `Query error: ${e.message}`;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  try {
    const { messages } = await req.json();
    const db = getDb();
    const anthropic = new Anthropic({ apiKey });

    // ── Baseline snapshot (always included) ──────────────────────────────────
    const sites = db.prepare(`
      SELECT id, name, type, status, power_capacity_mw, land_acres,
             opportunity_score, region, country, state, city,
             power_cost_per_mwh, pue_estimate, owner
      FROM sites ORDER BY opportunity_score DESC LIMIT 50
    `).all() as any[];

    const recentSignals = db.prepare(`
      SELECT sig.type, sig.date, sig.confidence, sig.description,
             si.name AS site_name, si.region
      FROM signals sig JOIN sites si ON sig.site_id = si.id
      ORDER BY sig.date DESC, sig.created_at DESC LIMIT 100
    `).all() as any[];

    const siteSummary = sites.map((s: any) =>
      `${s.name} | ${s.city}${s.state ? `, ${s.state}` : ''}, ${s.country} | ${s.region} | ${s.type} | ${s.status} | score=${s.opportunity_score} | ${s.power_capacity_mw}MW | ${s.land_acres}ac | $${s.power_cost_per_mwh}/MWh | PUE=${s.pue_estimate}${s.owner ? ` | owner=${s.owner}` : ''}`
    ).join('\n');

    const signalSummary = recentSignals.map((s: any) =>
      `[${s.date}] ${s.site_name} (${s.region}) — ${s.type} [${s.confidence}]: ${String(s.description).slice(0, 120)}`
    ).join('\n');

    // ── Phase 1: Haiku tool-use for live queries ──────────────────────────────
    let toolContext = '';
    try {
      const lastMsg = (messages as any[]).slice(-1)[0]?.content ?? '';
      const planResp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: 'You are a database query planner for DC Tracker. If the user question requires precise filtered data (specific regions, score thresholds, comparisons, counts, or details not obviously in a top-50 snapshot), call the appropriate tool(s). If the question is general or conversational, do NOT call any tools.',
        tools: DB_TOOLS,
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: typeof lastMsg === 'string' ? lastMsg : JSON.stringify(lastMsg) }],
      });

      if (planResp.stop_reason === 'tool_use') {
        const toolUses = planResp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const resultLines: string[] = [];
        for (const tu of toolUses) {
          const result = executeTool(db, tu.name, tu.input as Record<string, unknown>);
          resultLines.push(`### ${tu.name}(${JSON.stringify(tu.input)})\n${result}`);
        }
        if (resultLines.length > 0) {
          toolContext = `\n\n## Live Query Results\n${resultLines.join('\n\n')}`;
        }
      }
    } catch { /* non-fatal — fall back to snapshot only */ }

    // ── Build system prompt ───────────────────────────────────────────────────
    const systemPrompt = `You are an AI assistant embedded in DC Tracker, a private data center site acquisition intelligence platform. You help site selectors, infrastructure investors, and hyperscaler teams find, evaluate, and track data center development sites globally.

You have real-time access to the DC Tracker database. Use this data to answer questions with specifics — don't guess or hallucinate site details.

## Top 50 Sites by Opportunity Score
${siteSummary}

## Last 100 Signals (newest first)
${signalSummary}${toolContext}

Guidelines:
- Answer concisely and data-driven. Reference real sites and signals by name.
- When Live Query Results are present above, prioritise them over the snapshot.
- For site comparisons or rankings, use the data above.
- For questions about grid/interconnection policy, FERC, ISO queue dynamics, or power markets, draw on your general knowledge AND connect it to the specific sites/regions above.
- Format lists and tables clearly. Keep answers under 400 words unless the user asks for detail.
- If a site or signal isn't in the data above, say so — don't invent details.`;

    // ── Phase 2: Stream final answer ─────────────────────────────────────────
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
