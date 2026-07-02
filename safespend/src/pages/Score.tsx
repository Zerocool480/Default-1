import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';

interface Pillar {
  key: string;
  label: string;
  score: number;
  weight: number;
  reasons: string[];
}

interface ScoreView {
  forDate: string;
  total: number;
  pillars: Pillar[];
  deltaFromPrevious: number | null;
  deltaReasons: string[];
}

export function ScorePage() {
  const score = useQuery({ queryKey: ['score'], queryFn: () => api<ScoreView>('/api/score') });
  const [open, setOpen] = useState<string | null>(null);

  if (score.isLoading) return <p className="pt-16 text-center text-ink-faint">Scoring…</p>;
  const data = score.data;
  if (!data) return <p className="pt-16 text-center text-state-hold">Couldn't compute your score.</p>;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="btn-ghost" aria-label="Back">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Financial Health</h1>
      </header>

      <section className="card flex flex-col items-center py-6">
        <p className="tabular text-5xl font-semibold">{data.total}</p>
        <p className="text-xs text-ink-faint">out of 100</p>
        {data.deltaFromPrevious != null && data.deltaFromPrevious !== 0 && (
          <p
            className={clsx(
              'mt-1 text-sm',
              data.deltaFromPrevious > 0 ? 'text-accent' : 'text-state-hold',
            )}
          >
            {data.deltaFromPrevious > 0 ? '▲' : '▼'} {Math.abs(data.deltaFromPrevious)} since last
            score
          </p>
        )}
        {data.deltaReasons.length > 0 && (
          <div className="mt-3 flex w-full max-w-sm flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Why it changed
            </p>
            {data.deltaReasons.map((r, i) => (
              <p key={i} className="text-xs text-ink-soft dark:text-gray-300">
                {r}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="card divide-y divide-black/5 p-0 dark:divide-white/5">
        {data.pillars.map((p) => (
          <div key={p.key}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
              onClick={() => setOpen(open === p.key ? null : p.key)}
            >
              <span className="w-32 shrink-0 text-sm">{p.label}</span>
              <span className="tabular w-8 shrink-0 text-sm font-medium">{p.score}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className={clsx(
                    'h-full rounded-full',
                    p.score >= 70 ? 'bg-accent' : p.score >= 40 ? 'bg-state-tight' : 'bg-state-hold',
                  )}
                  style={{ width: `${p.score}%` }}
                />
              </div>
              <ChevronDown
                size={14}
                className={clsx('shrink-0 text-ink-faint transition-transform', open === p.key && 'rotate-180')}
              />
            </button>
            {open === p.key && (
              <div className="bg-surface-raised px-4 py-2 dark:bg-surface-dark">
                {p.reasons.map((r, i) => (
                  <p key={i} className="text-xs text-ink-soft dark:text-gray-300">
                    {r}
                  </p>
                ))}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">
                  {Math.round(p.weight * 100)}% of the total score
                </p>
              </div>
            )}
          </div>
        ))}
      </section>

      <p className="px-1 text-[11px] text-ink-faint">
        Every pillar is computed from your real data with fixed, published rules — tap any row for
        exactly why. Scores marked “not enough data” fill in as history accumulates.
      </p>
    </div>
  );
}
