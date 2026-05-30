'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, AlertCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Which sites in Texas have power below $45/MWh?',
  'What are the top 5 sites by opportunity score right now?',
  'Show me recent interconnection queue signals',
  'Compare opportunity scores in APAC vs MENA',
  'Which greenfield sites have the most signal activity?',
  'Explain what PJM interconnection congestion means for site timelines',
];

export default function AIChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');
    setError('');
    const updated: Message[] = [...messages, { role: 'user', content }];
    setMessages(updated);
    setStreaming(true);
    setStreamingText('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Chat request failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreamingText(full);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: full }]);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setStreaming(false);
      setStreamingText('');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Message thread ── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div>
              <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center mx-auto mb-3">
                <Bot size={20} className="text-white" />
              </div>
              <h3 className="text-slate-200 font-semibold text-base">DC Tracker AI</h3>
              <p className="text-slate-500 text-xs mt-1 max-w-xs">
                Ask anything about sites, signals, grid conditions, or interconnection timelines.
                Answers are grounded in live database data.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-xs text-slate-400 bg-[#111118] hover:bg-[#1a1a2e] border border-[#2d2d4e] rounded-lg px-3 py-2 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-white" />
              </div>
            )}
            <div className={`max-w-[82%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
              msg.role === 'user'
                ? 'bg-blue-700 text-white rounded-br-none'
                : 'bg-[#111118] border border-[#2d2d4e] text-slate-200 rounded-bl-none'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming bubble */}
        {streaming && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={12} className="text-white" />
            </div>
            <div className="max-w-[82%] rounded-xl rounded-bl-none px-3 py-2 text-sm leading-relaxed bg-[#111118] border border-[#2d2d4e] text-slate-200 whitespace-pre-wrap break-words min-w-[3rem]">
              {streamingText
                ? <>{streamingText}<span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 align-text-bottom animate-pulse" /></>
                : <Loader2 size={14} className="animate-spin text-slate-500 my-0.5" />
              }
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t border-[#1e1e2e] p-3">
        <form onSubmit={e => { e.preventDefault(); send(); }} className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about sites, signals, grid conditions…"
            disabled={streaming}
            className="flex-1 bg-[#111118] border border-[#2d2d4e] rounded-lg text-sm text-slate-200 placeholder-slate-600 px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

    </div>
  );
}
