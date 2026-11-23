import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { MitsLogo } from '@/src/components/MitsLogo';
import { useSound } from '@/src/context/SoundContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'model',
    text: 'Hi! I am the CampusCare Assistant for MITS Gwalior. Ask me to help find a room code (like FF-CR-105 or GF-LAB-BEE), pick the right issue category, or explain how ticket tracking works.',
  },
];

const QUICK_PROMPTS = [
  'Room code for Colloquium hall?',
  'Which category for broken projector?',
  'How do I track my complaint?',
];

export function CampusChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { play } = useSound();
  const navigate = useNavigate();

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const submitPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    // Exclude static UI greeting and error banners so conversation history sent to Gemini begins with a user message
    const apiMessages = nextHistory
      .filter((m) => m.id !== 'welcome' && !m.isError)
      .map((m) => ({ role: m.role, text: m.text }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'CampusCare',
        },
        body: JSON.stringify({
          messages: apiMessages,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Assistant is currently unavailable.');
      }

      setMessages((curr) => [
        ...curr,
        { id: crypto.randomUUID(), role: 'model', text: data.reply! },
      ]);
      play('notify');
    } catch (err) {
      play('error');
      setMessages((curr) => [
        ...curr,
        {
          id: crypto.randomUUID(),
          role: 'model',
          isError: true,
          text:
            err instanceof Error
              ? err.message
              : 'Could not reach the CampusCare assistant. Please try again.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPrompt(input);
  };

  // Detect room codes like FF-CR-105 or WS-MACHINE in replies for 1-click reporting
  const extractRoomCode = (text: string): string | null => {
    const match = text.match(/\b(?:GF|FF|WS|LIB|MBA|OUT)-[A-Z0-9-]+\b/);
    return match ? match[0] : null;
  };

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open CampusCare AI Assistant"
          className="h-11 px-4 rounded-2xl border border-white/15 bg-[#0B101D]/95 hover:border-cyan-400/50 text-sm font-medium text-slate-100 shadow-2xl flex items-center gap-2 transition-colors"
        >
          <Bot className="w-4 h-4 text-cyan-300" />
          <span className="hidden sm:inline">Campus Assistant</span>
        </button>
      ) : (
        <div className="w-[calc(100vw-2rem)] sm:w-96 h-[470px] glass-card rounded-2xl border border-white/15 shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between bg-[#090E1A]">
            <div className="flex items-center gap-2.5">
              <MitsLogo size={24} />
              <span className="font-display text-sm font-semibold text-white">
                CampusCare Assistant
              </span>
            </div>
            <button
              type="button"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const roomCode = msg.role === 'model' && !msg.isError ? extractRoomCode(msg.text) : null;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 border border-cyan-400/30 text-white'
                        : msg.isError
                          ? 'bg-amber-500/12 border border-amber-400/30 text-amber-200'
                          : 'bg-white/[0.05] border border-white/[0.08] text-slate-200'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {roomCode && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/report?room=${encodeURIComponent(roomCode)}`);
                      }}
                      className="mt-1.5 text-[11px] font-mono-tabular text-cyan-300 hover:underline"
                    >
                      Report issue in {roomCode} →
                    </button>
                  )}
                </div>
              );
            })}

            {messages.length === 1 && !sending && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void submitPrompt(q)}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-cyan-200 transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          <form
            onSubmit={sendMessage}
            className="p-3 border-t border-white/[0.08] bg-[#090E1A] flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about rooms, reporting, or tracking..."
              className="flex-1 rounded-xl bg-[#05070D] border border-white/12 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="w-9 h-9 rounded-xl btn-gradient text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
