import { NextRequest, NextResponse } from 'next/server';
import { getDb, getIngestionLog, logIngestionStart, logIngestionComplete } from '@/lib/db';
import { runSource, runAllSources, SOURCES } from '@/lib/ingestion/runner';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const db = getDb();
    const log = getIngestionLog(db, 100);
    return NextResponse.json(log);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const { script } = await req.json() as { script: string };

    const runAll = script === 'all';
    const sources = runAll ? Object.keys(SOURCES) : [script];

    if (!runAll && !SOURCES[script]) {
      return NextResponse.json(
        { error: `Unknown source: "${script}". Valid: ${Object.keys(SOURCES).join(', ')}, all` },
        { status: 400 }
      );
    }

    // Log a single run entry
    const logId = logIngestionStart(db, runAll ? 'all' : script);

    // Run async — return immediately, results land in ingestion_log
    (async () => {
      try {
        let totalNew = 0;
        let totalFound = 0;
        const lines: string[] = [];

        for (const key of sources) {
          const result = await runSource(db, key);
          totalNew += result.signalsNew;
          totalFound += result.signalsFound;
          const status = result.error ? `ERROR: ${result.error}` : `${result.signalsNew} new / ${result.signalsFound} found`;
          lines.push(`[${result.label}] ${status} (${result.durationMs}ms)`);
        }

        const output = lines.join('\n');
        logIngestionComplete(db, logId, totalNew, output, 'completed');
      } catch (e: any) {
        logIngestionComplete(db, logId, 0, e.message, 'failed');
      }
    })();

    return NextResponse.json({ logId, message: `Started ${runAll ? 'all sources' : SOURCES[script].label}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
