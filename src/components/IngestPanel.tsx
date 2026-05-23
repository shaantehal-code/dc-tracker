'use client';

import { useEffect, useState } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, Loader } from 'lucide-react';

interface LogRow {
  id: number;
  script: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  signals_found: number;
  output: string;
}

const SCRIPTS = [
  { key: 'eia', label: 'EIA Power Data', desc: 'Generators ≥100MW, retirements' },
  { key: 'iso_queues', label: 'ISO Queues', desc: 'PJM, CAISO, ERCOT, MISO interconnection' },
  { key: 'sec_edgar', label: 'SEC EDGAR', desc: '8-K/10-Q filings, 16 tracked companies' },
  { key: 'news', label: 'News & RSS', desc: 'DC Dynamics, DCK, Bisnow feeds' },
  { key: 'satellite', label: 'Satellite', desc: 'NDVI change + thermal signatures' },
];

const STATUS_ICON: Record<string, React.ReactNode> = {
  running: <Loader size={12} className="animate-spin text-yellow-400" />,
  completed: <CheckCircle size={12} className="text-green-400" />,
  failed: <XCircle size={12} className="text-red-400" />,
};

export default function IngestPanel() {
  const [log, setLog] = useState<LogRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function loadLog() {
    const res = await fetch('/api/ingest');
    if (res.ok) setLog(await res.json());
  }

  useEffect(() => {
    loadLog();
    const interval = setInterval(loadLog, 5000);
    return () => clearInterval(interval);
  }, []);

  async function triggerScript(key: string) {
    setRunning(key);
    await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: key }) });
    setTimeout(() => { setRunning(null); loadLog(); }, 1000);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-[#1e1e2e]">
        <h2 className="text-sm font-semibold text-white">Data Ingestion</h2>
        <button onClick={loadLog} className="text-slate-500 hover:text-white">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="p-3 border-b border-[#1e1e2e]">
        <div className="text-[10px] text-slate-500 uppercase mb-2">Run Scripts</div>
        <div className="flex flex-col gap-1.5">
          {SCRIPTS.map(s => (
            <div key={s.key} className="flex items-center justify-between bg-[#111118] rounded p-2 border border-[#1e1e2e]">
              <div>
                <div className="text-xs font-medium text-slate-300">{s.label}</div>
                <div className="text-[10px] text-slate-600">{s.desc}</div>
              </div>
              <button
                onClick={() => triggerScript(s.key)}
                disabled={running === s.key}
                className="flex items-center gap-1 px-2 py-1 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 rounded text-[11px] text-white transition-colors"
              >
                {running === s.key ? <Loader size={10} className="animate-spin" /> : <Play size={10} />}
                Run
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-3">
        <div className="text-[10px] text-slate-500 uppercase mb-2">Run History</div>
        {log.length === 0 && <div className="text-xs text-slate-600">No runs yet.</div>}
        {log.map(row => (
          <div key={row.id} className="mb-2 bg-[#111118] rounded border border-[#1e1e2e] overflow-hidden">
            <div
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-[#141420]"
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            >
              <div className="flex items-center gap-2">
                {STATUS_ICON[row.status] || STATUS_ICON.failed}
                <span className="text-xs text-slate-300">{row.script}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-600">
                {row.signals_found > 0 && <span className="text-blue-400">{row.signals_found} signals</span>}
                <span>{row.started_at?.slice(0, 16)}</span>
              </div>
            </div>
            {expanded === row.id && row.output && (
              <pre className="p-2 text-[10px] text-slate-500 border-t border-[#1e1e2e] overflow-x-auto whitespace-pre-wrap max-h-40">
                {row.output}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
