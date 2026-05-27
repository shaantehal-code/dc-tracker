'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, Loader, Zap, Database, Globe, Radio, FileText } from 'lucide-react';

interface LogRow {
  id: number;
  script: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  signals_found: number;
  output: string;
}

const SOURCES = [
  {
    key: 'all',
    label: 'Run All Sources',
    desc: 'SEC EDGAR + RSS + EIA + FERC + GDELT in sequence',
    Icon: Zap,
  },
  {
    key: 'sec_edgar',
    label: 'SEC EDGAR',
    desc: '8-K / 10-K filings — 15+ tracked DC companies',
    Icon: FileText,
  },
  {
    key: 'news_rss',
    label: 'News & RSS',
    desc: 'DCD, The Register, DCFrontier, Bisnow + more',
    Icon: Globe,
  },
  {
    key: 'eia',
    label: 'EIA Power Data',
    desc: 'US electricity prices by state (needs EIA_API_KEY env var)',
    Icon: Zap,
  },
  {
    key: 'ferc',
    label: 'Power Grid Intel',
    desc: 'PPA deals, nuclear agreements, grid interconnection news',
    Icon: Radio,
  },
  {
    key: 'gdelt',
    label: 'Global Expansion',
    desc: 'International DC construction, investment & greenfield announcements',
    Icon: Database,
  },
];

const STATUS_CONFIG = {
  running:   { icon: <Loader size={11} className="animate-spin text-yellow-400" />, color: 'text-yellow-400', bg: 'bg-yellow-900/10' },
  completed: { icon: <CheckCircle size={11} className="text-green-400" />,         color: 'text-green-400',  bg: 'bg-green-900/10' },
  failed:    { icon: <XCircle size={11} className="text-red-400" />,               color: 'text-red-400',    bg: 'bg-red-900/10' },
};

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function IngestPanel() {
  const [log, setLog] = useState<LogRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [totalSignals, setTotalSignals] = useState<number | null>(null);

  const loadLog = useCallback(async () => {
    const [logRes, statsRes] = await Promise.all([
      fetch('/api/ingest'),
      fetch('/api/remote-control'),
    ]);
    if (logRes.ok) setLog(await logRes.json());
    if (statsRes.ok) {
      const stats = await statsRes.json();
      setTotalSignals(typeof stats.signalCount === 'number' ? stats.signalCount : null);
    }
  }, []);

  useEffect(() => {
    loadLog();
    const interval = setInterval(loadLog, 4000);
    return () => clearInterval(interval);
  }, [loadLog]);

  const trigger = useCallback(async (key: string) => {
    if (running) return;
    setRunning(key);
    try {
      await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: key }),
      });
      const poll = setInterval(async () => {
        const res = await fetch('/api/ingest');
        if (res.ok) {
          const newLog: LogRow[] = await res.json();
          setLog(newLog);
          const latest = newLog.find(r => r.script === key);
          if (latest && latest.status !== 'running') {
            clearInterval(poll);
            setRunning(null);
          }
        }
      }, 2500);
      setTimeout(() => { clearInterval(poll); setRunning(null); }, 180000);
    } catch {
      setRunning(null);
    }
  }, [running]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0d0d14] shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Live Data Ingestion</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">5 live sources · SEC EDGAR · RSS · EIA · Power Grid · Global Intel</p>
        </div>
        <div className="flex items-center gap-3">
          {totalSignals !== null && (
            <div className="text-right">
              <div className="text-lg font-bold text-blue-400">{totalSignals}</div>
              <div className="text-[9px] text-slate-600">signals in DB</div>
            </div>
          )}
          <button onClick={loadLog} className="text-slate-500 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="flex flex-col gap-2">
            {SOURCES.map(({ key, label, desc, Icon }) => {
              const last = log.find(r => r.script === key);
              const isRunning = running === key;
              const cfg = last ? STATUS_CONFIG[last.status] : null;
              const isAllBtn = key === 'all';

              return (
                <div key={key}
                  className="flex items-center justify-between rounded border border-[#2d2d4e] bg-[#0a0a1a] p-2.5 hover:border-[#3d3d6e] transition-colors">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Icon size={14} className="text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200">{label}</div>
                      <div className="text-[10px] text-slate-600 truncate">{desc}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {cfg && (
                      <div className={`flex items-center gap-1 text-[10px] ${cfg.color}`}>
                        {cfg.icon}
                        {last?.signals_found ? `+${last.signals_found}` : last?.status === 'completed' ? '✓' : ''}
                        {last?.started_at && (
                          <span className="text-slate-600 ml-1">{timeSince(last.started_at)}</span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => trigger(key)}
                      disabled={!!running}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-white transition-colors disabled:opacity-40 ${
                        isAllBtn ? 'bg-blue-700 hover:bg-blue-600' : 'bg-[#1a1a2e] hover:bg-[#252540]'
                      }`}
                    >
                      {isRunning ? <Loader size={10} className="animate-spin" /> : <Play size={10} />}
                      {isAllBtn ? 'Run All' : 'Run'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Run History</div>
          {log.length === 0 && (
            <div className="text-xs text-slate-600 py-4 text-center">No runs yet — click Run above.</div>
          )}
          {log.slice(0, 40).map(row => {
            const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.failed;
            return (
              <div key={row.id} className={`mb-1.5 rounded border border-[#1e1e2e] overflow-hidden ${cfg.bg}`}>
                <div
                  className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-white/5"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <div className="flex items-center gap-1.5">
                    {cfg.icon}
                    <span className="text-xs text-slate-300">{row.script}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    {row.signals_found > 0 && (
                      <span className="text-blue-400 font-medium">+{row.signals_found} signals</span>
                    )}
                    <span className="text-slate-600">{timeSince(row.started_at)}</span>
                  </div>
                </div>
                {expanded === row.id && row.output && (
                  <pre className="px-2.5 py-2 text-[10px] text-slate-400 border-t border-[#1e1e2e] overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed font-mono">
                    {row.output}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
