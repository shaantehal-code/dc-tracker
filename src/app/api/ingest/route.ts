import { NextRequest, NextResponse } from 'next/server';
import { getDb, getIngestionLog, logIngestionStart, logIngestionComplete } from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts');

const AVAILABLE_SCRIPTS: Record<string, string> = {
  eia: 'fetch_eia.py',
  iso_queues: 'fetch_iso_queues.py',
  sec_edgar: 'fetch_sec_edgar.py',
  news: 'fetch_news.py',
  satellite: 'fetch_satellite_signals.py',
};

export function GET() {
  try {
    const db = getDb();
    const log = getIngestionLog(db, 50);
    return NextResponse.json(log);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const { script } = await req.json();
    const filename = AVAILABLE_SCRIPTS[script];
    if (!filename) {
      return NextResponse.json({ error: `Unknown script: ${script}` }, { status: 400 });
    }

    const scriptPath = path.join(SCRIPTS_DIR, filename);
    const logId = logIngestionStart(db, script);

    // Fire-and-forget — don't await completion
    const proc = spawn('python', [scriptPath], {
      env: { ...process.env },
      cwd: SCRIPTS_DIR,
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });

    proc.on('close', (code: number) => {
      const status = code === 0 ? 'completed' : 'failed';
      const signalMatch = output.match(/(\d+)\s+signal/i);
      const signalsFound = signalMatch ? parseInt(signalMatch[1]) : 0;
      logIngestionComplete(db, logId, signalsFound, output.slice(0, 4000), status);
    });

    return NextResponse.json({ logId, message: `Started ${filename}` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
