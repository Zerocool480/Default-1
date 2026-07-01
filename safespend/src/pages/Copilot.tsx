import { MessageCircle } from 'lucide-react';

const upcomingPrompts = [
  'Why did my number change today?',
  'What should I do with my next paycheck?',
  'How much can I spend this weekend?',
  'Should I pay off debt or save more?',
];

/**
 * Placeholder until milestone M11: the copilot is a tool-use loop over the
 * same engine/forecast/goal APIs this app already serves — see
 * docs/budget/ARCHITECTURE.md §5.
 */
export function CopilotPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Copilot</h1>
      <div className="card flex flex-col items-center gap-3 py-10 text-center">
        <MessageCircle size={28} className="text-ink-faint" />
        <p className="max-w-xs text-sm text-ink-soft dark:text-gray-300">
          Your financial copilot arrives in a later milestone. It will answer questions like
          these using your real numbers — never guesses:
        </p>
        <ul className="flex flex-col gap-1.5">
          {upcomingPrompts.map((p) => (
            <li
              key={p}
              className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs text-ink-faint dark:bg-surface-dark"
            >
              “{p}”
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-faint">
          Until then, the “Why this number?” breakdown on Today answers the most important one.
        </p>
      </div>
    </div>
  );
}
