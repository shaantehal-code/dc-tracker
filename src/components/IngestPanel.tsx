'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, Loader, Zap } from 'lucide-react';

interface LogRow {
  id: number;
  script: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  signals_found: number;
  output: string;
}

interface SourceMeta { key: string; label: string; desc: string }

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
  const [log, setLog]           = useState<LogRow[]>([]);
  const [sources, setSources]   = useState<SourceMeta[]>([]);
  const [running, setRunning]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [totalSignals, setTotalSignals] = useState<number | null>(null);
  const [siteCount, setSiteCount]       = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    const [logRes, statsRes] = await Promise.all([
      fetch('/api/ingest'),
      fetch('/api/remote-control'),
    ]);
    if (logRes.ok) setLog(await logRes.json());
    if (statsRes.ok) {
      const stats = await statsRes.json();
      if (typeof stats.signalCount === 'number') setTotalSignals(stats.signalCount);
      if (typeof stats.siteCount   === 'number') setSiteCount(stats.siteCount);
      if (Array.isArray(stats.sources)) setSources(stats.sources);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const iv = setInterval(loadStats, 4000);
    return () => clearInterval(iv);
  }, [loadStats]);

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
            loadStats();
          }
        }
      }, 2500);
      setTimeout(() => { clearInterval(poll); setRunning(null); }, 300000);
    } catch {
      setRunning(null);
    }
  }, [running, loadStats]);

  const displaySources: SourceMeta[] = sources.length > 0 ? sources : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e2e] bg-[#0d0d14] shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Live Data Ingestion</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {displaySources.length > 0 ? `${displaySources.length} sources` : 'Loading…'} · auto-runs every 6h
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3">
            {siteCount !== null && (
              <div className="text-right">
                <div className="text-lg font-bold text-slate-300">{siteCount}</div>
                <div className="text-[9px] text-slate-600">sites</div>
              </div>
            )}
            {totalSignals !== null && (
              <div className="text-right">
                <div className="text-lg font-bold text-blue-400">{totalSignals.toLocaleString()}</div>
                <div className="text-[9px] text-slate-600">signals</div>
              </div>
            )}
          </div>
          <button onClick={loadStats} className="text-slate-500 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Run All button */}
        <div className="p-3 pb-0">
          <button
            onClick={() => trigger('all')}
            disabled={!!running}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold transition-colors mb-3"
          >
            {running === 'all' ? <Loader size={12} className="animate-spin" /> : <Zap size={12} />}
            Run All {displaySources.length > 0 ? `${displaySources.length} Sources` : 'Sources'}
          </button>

          {/* Individual source buttons — dynamic from API */}
          <div className="flex flex-col gap-2">
            {displaySources.map(({ key, label, desc }) => {
              const last = log.find(r => r.script === key);
              const isRunning = running === key;
              const cfg = last ? STATUS_CONFIG[last.status] : null;

              return (
                <div key={key}
                  className="flex items-center justify-between rounded border border-[#2d2d4e] bg-[#0a0a1a] p-2.5 hover:border-[#3d3d6e] transition-colors">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-xs font-medium text-slate-200">{label}</div>
                    <div className="text-[10px] text-slate-600 truncate">{desc}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-white bg-[#1a1a2e] hover:bg-[#252540] transition-colors disabled:opacity-40"
                    >
                      {isRunning ? <Loader size={10} className="animate-spin" /> : <Play size={10} />}
                      Run
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Run history */}
        <div className="p-3 mt-1">
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
