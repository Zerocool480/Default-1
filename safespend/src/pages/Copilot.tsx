import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { MessageCircle, Send, Wrench } from 'lucide-react';
import { api } from '../lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

const suggestedPrompts = [
  'Why is my number what it is today?',
  'How am I doing overall?',
  'Can I afford a $200 grocery run this week?',
  'Where did my money go this month?',
];

const toolLabels: Record<string, string> = {
  get_safe_to_spend: "today's snapshot",
  get_forecast: 'cash-flow forecast',
  get_health_score: 'health score',
  get_goals: 'goals',
  get_budgets: 'budgets',
  get_recurring: 'recurring bills',
  get_spending_summary: 'spending summary',
  run_purchase_scenario: 'purchase simulation',
};

export function CopilotPage() {
  const status = useQuery({
    queryKey: ['copilot-status'],
    queryFn: () => api<{ enabled: boolean }>('/api/copilot/status'),
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (message: string) =>
      api<{ conversationId: string; reply: string; toolsUsed: string[] }>('/api/copilot/message', {
        method: 'POST',
        json: { message, conversationId },
      }),
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, toolsUsed: data.toolsUsed },
      ]);
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong — try again.',
        },
      ]);
    },
  });

  function ask(text: string) {
    const message = text.trim();
    if (!message || send.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    send.mutate(message);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, send.isPending]);

  if (status.data && !status.data.enabled) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold tracking-tight">Copilot</h1>
        <p className="card text-sm text-ink-faint">
          The copilot needs an Anthropic API key on the server (AI_ENABLED + ANTHROPIC_API_KEY).
          Everything else in the app works without it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col gap-3 md:h-[calc(100dvh-6rem)]">
      <h1 className="text-lg font-semibold tracking-tight">Copilot</h1>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 py-8 text-center">
            <MessageCircle size={26} className="text-ink-faint" />
            <p className="max-w-xs text-sm text-ink-soft dark:text-gray-300">
              Ask anything about your money. Every number in my answers comes from your real data —
              never a guess.
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs text-ink-soft hover:bg-black/10 dark:bg-surface-dark dark:text-gray-300 dark:hover:bg-white/10"
                >
                  “{p}”
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm',
                  m.role === 'user'
                    ? 'self-end bg-accent text-white'
                    : 'card self-start dark:text-gray-100',
                )}
              >
                {m.content}
                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-ink-faint">
                    <Wrench size={10} />
                    based on {m.toolsUsed.map((t) => toolLabels[t] ?? t).join(', ')}
                  </p>
                )}
              </div>
            ))}
            {send.isPending && (
              <div className="card max-w-[85%] self-start px-3.5 py-2.5 text-sm text-ink-faint">
                Checking your numbers…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            className="input flex-1"
            placeholder="Ask about your money…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
          />
          <button className="btn-primary" disabled={!input.trim() || send.isPending} aria-label="Send">
            <Send size={16} />
          </button>
        </form>
        <p className="text-center text-[10px] text-ink-faint">
          Decision support from your own data — not licensed financial advice.
        </p>
      </div>
    </div>
  );
}
