'use client';

import { useState, useEffect, useCallback } from 'react';

interface StatusData {
  siteCount: number;
  signalCount: number;
  lastIngest: any;
}

interface LogEntry {
  ts: string;
  command: string;
  params: Record<string, unknown>;
  result: any;
}

interface SystemData {
  siteCount: number;
  signalCount: number;
  ingestLog: any[];
  commandLog: LogEntry[];
}

export default function RemoteControlPanel() {
  const [system, setSystem] = useState<SystemData | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/remote-control');
      if (res.ok) {
        const data: SystemData = await res.json();
        setSystem(data);
        setLog(data.commandLog);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const runCommand = useCallback(async (command: string, params: Record<string, unknown> = {}) => {
    setLoading(command);
    try {
      const res = await fetch('/api/remote-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params }),
      });
      const data = await res.json();
      const entry: LogEntry = { ts: new Date().toISOString(), command, params, result: data };
      setLog(prev => [entry, ...prev.slice(0, 19)]);
      await fetchStatus();
      return data;
    } finally {
      setLoading(null);
    }
  }, [fetchStatus]);

  function fmtTime(ts: string) {
    return new Date(ts).toLocaleTimeString();
  }

  function statusColor(cmd: string, result: any) {
    if (result?.error) return 'text-red-400';
    if (result?.ok === false) return 'text-amber-400';
    return 'text-emerald-400';
  }

  const curlBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <div className="h-full overflow-auto p-4 flex flex-col gap-4">

      {/* System status */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sites', value: system?.siteCount ?? '…' },
          { label: 'Signals', value: system?.signalCount ?? '…' },
          { label: 'Ingestion runs', value: system?.ingestLog?.length ?? '…' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#111120] border border-[#1e1e2e] rounded p-3 flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-bold text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* Command buttons */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded p-4 flex flex-col gap-3">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Commands</div>
        <div className="grid grid-cols-2 gap-2">
          <CommandBtn
            label="Get Status"
            description="Refresh site, signal &amp; ingest counts"
            command="status"
            loading={loading}
            onClick={() => runCommand('status')}
          />
          <CommandBtn
            label="Seed Database"
            description="Populate with demo sites &amp; signals"
            command="seed"
            loading={loading}
            onClick={() => runCommand('seed', { force: false })}
          />
          <CommandBtn
            label="Force Re-seed"
            description="Wipe &amp; re-populate all data"
            command="seed_force"
            loading={loading}
            variant="danger"
            onClick={() => runCommand('seed', { force: true })}
          />
          <CommandBtn
            label="Clear Signals"
            description="Delete all ingested signals"
            command="clear_signals"
            loading={loading}
            variant="danger"
            onClick={() => runCommand('clear_signals')}
          />
          <CommandBtn
            label="Export Data"
            description="Download all sites as JSON"
            command="export"
            loading={loading}
            onClick={async () => {
              const data = await runCommand('export');
              if (data?.result?.sites) {
                const blob = new Blob([JSON.stringify(data.result.sites, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'dc-sites.json'; a.click();
                URL.revokeObjectURL(url);
              }
            }}
          />
          <CommandBtn
            label="Refresh Status"
            description="Re-fetch system metrics"
            command="__refresh"
            loading={loading}
            onClick={fetchStatus}
          />
        </div>
      </div>

      {/* Command log */}
      {log.length > 0 && (
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded p-4 flex flex-col gap-2">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Command Log</div>
          <div className="flex flex-col gap-1">
            {log.map((entry, i) => (
              <div key={i}>
                <button
                  className="w-full text-left flex items-center gap-2 p-2 rounded hover:bg-[#1a1a2e] transition-colors group"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className={`text-xs font-mono ${statusColor(entry.command, entry.result)}`}>●</span>
                  <span className="text-xs font-mono text-slate-300 flex-1">{entry.command}</span>
                  <span className="text-[10px] text-slate-600">{fmtTime(entry.ts)}</span>
                  <span className="text-[10px] text-slate-600 group-hover:text-slate-400">{expanded === i ? '▲' : '▼'}</span>
                </button>
                {expanded === i && (
                  <pre className="text-[10px] text-slate-400 bg-[#080810] rounded p-2 overflow-auto max-h-48 font-mono leading-relaxed">
                    {JSON.stringify(entry.result, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API reference */}
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded p-4 flex flex-col gap-3">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Remote API</div>
        <p className="text-xs text-slate-500">
          Control this tracker externally via <code className="text-slate-300">POST /api/remote-control</code>.
        </p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Status', body: '{"command":"status"}' },
            { label: 'Seed', body: '{"command":"seed"}' },
            { label: 'Force re-seed', body: '{"command":"seed","params":{"force":true}}' },
            { label: 'Export', body: '{"command":"export"}' },
            { label: 'Clear signals', body: '{"command":"clear_signals"}' },
          ].map(({ label, body }) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500">{label}</span>
              <code className="text-[10px] font-mono text-emerald-400 bg-[#080810] rounded p-2 break-all">
                {`curl -X POST ${curlBase}/api/remote-control \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`}
              </code>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

interface CommandBtnProps {
  label: string;
  description: string;
  command: string;
  loading: string | null;
  variant?: 'default' | 'danger';
  onClick: () => void;
}

function CommandBtn({ label, description, command, loading, variant = 'default', onClick }: CommandBtnProps) {
  const isLoading = loading === command;
  const base = variant === 'danger'
    ? 'border-red-900/50 hover:border-red-700 hover:bg-red-900/20'
    : 'border-[#2d2d4e] hover:border-blue-600 hover:bg-[#111130]';
  return (
    <button
      onClick={onClick}
      disabled={loading !== null}
      className={`flex flex-col gap-1 p-3 rounded border bg-[#0a0a1a] text-left transition-colors disabled:opacity-50 ${base}`}
    >
      <span className="text-xs font-semibold text-white flex items-center gap-2">
        {isLoading && <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />}
        {label}
      </span>
      <span className="text-[10px] text-slate-500">{description}</span>
    </button>
  );
}
