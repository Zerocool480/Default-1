import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, RefreshCw, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { formatCents, toCents } from '@shared/money';
import { formatShort } from '@shared/dates';
import type { EngineResult } from '@shared/engine';
import type { ForecastDay } from '@shared/forecast';
import { OnboardingCard } from '../components/OnboardingCard';

interface Briefing {
  forDate: string;
  healthScore: number | null;
  healthDelta: number | null;
  checkingTotal: string;
  upcomingBillsTotal: string;
  goalsStatus: 'on_track' | 'attention' | 'off_track';
  recommendationCode: string;
  recommendationText: string;
  recommendationReasons: string[];
}

interface Insight {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
}

interface Snapshot {
  forDate: string;
  computedAt: string;
  trigger: string;
  result: EngineResult;
}

interface ForecastResponse {
  todayISO: string;
  dailyDiscretionaryCents: number;
  days: ForecastDay[];
  minDay: { dateISO: string; endBalanceCents: number };
}

const statusStyles = {
  ok: 'text-ink dark:text-gray-50',
  tight: 'text-state-tight',
  hold: 'text-state-hold',
} as const;

export function TodayPage() {
  const qc = useQueryClient();
  const [showWhy, setShowWhy] = useState(false);

  const snapshot = useQuery({
    queryKey: ['engine', 'today'],
    queryFn: () => api<Snapshot>('/api/engine/today'),
  });
  const forecast = useQuery({
    queryKey: ['forecast', 7],
    queryFn: () => api<ForecastResponse>('/api/forecast?horizon=7'),
  });
  const recompute = useMutation({
    mutationFn: () => api<Snapshot>('/api/engine/recompute', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const briefing = useQuery({
    queryKey: ['briefing'],
    queryFn: () => api<Briefing>('/api/briefing/today'),
  });
  const insights = useQuery({
    queryKey: ['insights'],
    queryFn: () => api<Insight[]>('/api/insights'),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/api/insights/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });

  if (snapshot.isLoading) {
    return <p className="pt-16 text-center text-ink-faint">Working out your number…</p>;
  }
  if (snapshot.isError || !snapshot.data) {
    return <p className="pt-16 text-center text-state-hold">Couldn't load your number — try again in a moment.</p>;
  }

  const { result, computedAt } = snapshot.data;
  const holdButRecoverable = result.status === 'hold' && result.rawPoolCents > 0;
  const overcommitted = result.status === 'hold' && result.rawPoolCents <= 0;
  const spentPct =
    result.dailyAllowanceCents > 0
      ? Math.min(100, Math.round((result.spentTodayCents / result.dailyAllowanceCents) * 100))
      : 100;

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{greeting}.</h1>
          <p className="text-xs text-ink-faint">
            data as of{' '}
            {new Date(computedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {briefing.data?.healthScore != null && (
            <Link
              to="/score"
              className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent dark:bg-accent/20"
              title="Financial health"
            >
              ⛨ {briefing.data.healthScore}
              {briefing.data.healthDelta != null && briefing.data.healthDelta !== 0 && (
                <span className={briefing.data.healthDelta > 0 ? '' : 'text-state-hold'}>
                  {briefing.data.healthDelta > 0 ? '▲' : '▼'}
                  {Math.abs(briefing.data.healthDelta)}
                </span>
              )}
            </Link>
          )}
          <button
            className="btn-ghost"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            title="Recompute now"
          >
            <RefreshCw size={15} className={recompute.isPending ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* The number */}
      <section className="card flex flex-col items-center py-8">
        <p className="text-sm font-medium text-ink-faint">
          {overcommitted ? 'Hold off today' : 'Safe to Spend Today'}
        </p>
        <p className={clsx('tabular my-2 text-6xl font-semibold tracking-tight', statusStyles[result.status])}>
          {formatCents(result.safeToSpendTodayCents)}
        </p>

        {holdButRecoverable && (
          <p className="text-center text-sm text-ink-soft dark:text-gray-300">
            Today's allowance is used. Tomorrow resets to about{' '}
            <span className="tabular font-medium">
              {formatCents(Math.floor(result.discretionaryPoolCents / Math.max(1, result.daysLeft - 1)))}
            </span>
            .
          </p>
        )}
        {overcommitted && result.recovery && (
          <p className="max-w-xs text-center text-sm text-ink-soft dark:text-gray-300">
            You're {formatCents(result.recovery.shortfallCents)} short for the next{' '}
            {result.daysLeft} days. Skipping about{' '}
            <span className="tabular font-medium">{formatCents(result.recovery.perDayCents)}/day</span>{' '}
            of extras gets you back on track by {formatShort(result.periodEndISO)}.
          </p>
        )}

        {/* spent-today bar */}
        {!overcommitted && result.dailyAllowanceCents > 0 && (
          <div className="mt-4 w-full max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  spentPct < 80 ? 'bg-accent' : spentPct < 100 ? 'bg-state-tight' : 'bg-state-hold',
                )}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <p className="tabular mt-1.5 text-center text-xs text-ink-faint">
              spent {formatCents(result.spentTodayCents)} of {formatCents(result.dailyAllowanceCents)} today
            </p>
          </div>
        )}

        <button
          className="btn-ghost mt-5 text-sm"
          onClick={() => setShowWhy(!showWhy)}
          aria-expanded={showWhy}
        >
          Why this number?
          <ChevronDown size={15} className={clsx('transition-transform', showWhy && 'rotate-180')} />
        </button>

        {showWhy && (
          <div className="mt-3 w-full max-w-sm rounded-xl bg-surface-raised p-4 text-sm dark:bg-surface-dark">
            {result.lineItems.map((li, i) =>
              li.kind === 'divide' ? (
                <div
                  key={i}
                  className="mt-2 flex justify-between border-t border-black/10 pt-2 font-medium dark:border-white/10"
                >
                  <span>{li.label}</span>
                  <span className="tabular">{formatCents(li.amountCents)}/day</span>
                </div>
              ) : (
                <div key={i} className="flex justify-between py-0.5">
                  <span className={li.kind === 'cash' ? 'font-medium' : 'text-ink-soft dark:text-gray-300'}>
                    {li.label}
                  </span>
                  <span className="tabular">{formatCents(li.amountCents, { sign: true })}</span>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <OnboardingCard />

      {/* Today's briefing */}
      {briefing.data && (
        <section
          className={clsx(
            'card border-l-4',
            briefing.data.recommendationCode === 'spend_freely'
              ? 'border-l-accent'
              : briefing.data.recommendationCode === 'recovery'
                ? 'border-l-state-hold'
                : 'border-l-state-tight',
          )}
        >
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Today's briefing
          </h2>
          <p className="text-sm font-medium">{briefing.data.recommendationText}</p>
          {briefing.data.recommendationReasons.map((r, i) => (
            <p key={i} className="mt-1 text-xs text-ink-soft dark:text-gray-300">
              {r}
            </p>
          ))}
          <p className="mt-2 text-xs text-ink-faint">
            Bills before payday:{' '}
            <span className="tabular">{formatCents(toCents(briefing.data.upcomingBillsTotal))}</span>
            {' · '}Goals:{' '}
            {briefing.data.goalsStatus === 'on_track'
              ? 'on track'
              : briefing.data.goalsStatus === 'attention'
                ? 'need attention'
                : 'off track'}
          </p>
        </section>
      )}

      {/* Next 7 days */}
      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Next 7 days</h2>
        {forecast.data ? <WeekStrip days={forecast.data.days} /> : <p className="text-xs text-ink-faint">Projecting…</p>}
      </section>

      {/* Coach insights, max 2, dismissible */}
      {(insights.data ?? []).map((insight) => (
        <section key={insight.id} className="card flex items-start gap-2 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{insight.title}</p>
            <p className="mt-0.5 text-xs text-ink-soft dark:text-gray-300">{insight.body}</p>
          </div>
          <button
            className="text-ink-faint hover:text-ink"
            onClick={() => dismiss.mutate(insight.id)}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </section>
      ))}
    </div>
  );
}

function WeekStrip({ days }: { days: ForecastDay[] }) {
  const max = Math.max(...days.map((d) => Math.abs(d.endBalanceCents)), 1);
  const eventful = days.filter((d) => d.events.length > 0);
  return (
    <div>
      <div className="flex items-end justify-between gap-1.5" style={{ height: 56 }}>
        {days.map((d) => {
          const h = Math.max(6, Math.round((Math.abs(d.endBalanceCents) / max) * 52));
          const negative = d.endBalanceCents < 0;
          return (
            <div key={d.dateISO} className="flex flex-1 flex-col items-center gap-1" title={`${formatShort(d.dateISO)}: ${formatCents(d.endBalanceCents)}`}>
              <div
                className={clsx('w-full rounded-sm', negative ? 'bg-state-hold' : d.events.length > 0 ? 'bg-accent/80' : 'bg-black/15 dark:bg-white/20')}
                style={{ height: h }}
              />
              <span className="text-[10px] text-ink-faint">{formatShort(d.dateISO).split(' ')[1]}</span>
            </div>
          );
        })}
      </div>
      {eventful.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {eventful.slice(0, 4).map((d) => (
            <li key={d.dateISO} className="flex justify-between text-xs text-ink-soft dark:text-gray-300">
              <span>
                {formatShort(d.dateISO)} · {d.events.map((e) => e.label).join(', ')}
              </span>
              <span className="tabular">
                {formatCents(d.events.reduce((s, e) => s + e.amountCents, 0), { sign: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
