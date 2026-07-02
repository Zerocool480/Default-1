import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatCents, toCents } from '@shared/money';
import { formatShort } from '@shared/dates';

interface Goal {
  id: string;
  name: string;
  targetAmount: string;
  fundedAmount: string;
  monthlyContribution: string;
  status: string;
  eta: { etaISO: string | null; percentComplete: number; monthsRemaining: number | null };
}

interface Stream {
  id: string;
  direction: 'inflow' | 'outflow';
  description: string;
  merchantName: string | null;
  frequency: string;
  averageAmount: string;
  lastAmount: string | null;
  nextExpectedDate: string | null;
  status: string;
  isEssential: boolean;
}

type Tab = 'goals' | 'budgets' | 'recurring' | 'calendar';

export function PlanPage() {
  const [tab, setTab] = useState<Tab>('goals');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Plan</h1>
      <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
        {(['goals', 'budgets', 'recurring', 'calendar'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 rounded-lg px-2 py-1.5 text-sm font-medium capitalize',
              tab === t ? 'bg-surface shadow-sm dark:bg-surface-dark-raised' : 'text-ink-faint',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'goals' && <GoalsTab />}
      {tab === 'budgets' && <BudgetsTab />}
      {tab === 'recurring' && <RecurringTab />}
      {tab === 'calendar' && <CalendarTab />}
    </div>
  );
}

interface BudgetsResponse {
  monthProgressPct: number;
  budgets: Array<{
    id: string;
    categoryName: string;
    monthlyLimit: string;
    spent: string;
  }>;
}

function BudgetsTab() {
  const budgets = useQuery({ queryKey: ['budgets'], queryFn: () => api<BudgetsResponse>('/api/budgets') });
  if (budgets.isLoading) return <p className="text-center text-ink-faint">Loading budgets…</p>;
  const data = budgets.data;
  if (!data || data.budgets.length === 0) {
    return <p className="card text-sm text-ink-faint">No category budgets yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-xs text-ink-faint">{data.monthProgressPct}% of the month is gone —
        bars compare spending pace against that.</p>
      {data.budgets.map((b) => {
        const limit = toCents(b.monthlyLimit);
        const spent = toCents(b.spent);
        const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 100;
        // Time-adjusted pace: 70% spent at 60% of month = hot, not red.
        const pace = pct <= data.monthProgressPct + 5 ? 'ok' : pct < 100 ? 'hot' : 'over';
        return (
          <div key={b.id} className="card py-3">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium">{b.categoryName}</span>
              <span className="tabular text-ink-soft dark:text-gray-300">
                {formatCents(spent)} of {formatCents(limit)}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={clsx(
                  'h-full rounded-full',
                  pace === 'ok' ? 'bg-accent' : pace === 'hot' ? 'bg-state-tight' : 'bg-state-hold',
                )}
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-ink-faint/60"
                style={{ left: `${data.monthProgressPct}%` }}
                title="today"
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">
              {pace === 'ok'
                ? 'On pace.'
                : pace === 'hot'
                  ? `Running hot — ${formatCents(Math.max(0, limit - spent))} left for the rest of the month.`
                  : 'Done for the month — the engine leans on other categories now.'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

interface ForecastResponse {
  todayISO: string;
  days: Array<{
    dateISO: string;
    endBalanceCents: number;
    events: Array<{ id: string; label: string; amountCents: number; type: string }>;
  }>;
  minDay: { dateISO: string; endBalanceCents: number };
}

function CalendarTab() {
  const forecast = useQuery({
    queryKey: ['forecast', 30],
    queryFn: () => api<ForecastResponse>('/api/forecast?horizon=30'),
  });
  if (forecast.isLoading) return <p className="text-center text-ink-faint">Projecting…</p>;
  const data = forecast.data;
  if (!data) return <p className="card text-sm text-state-hold">Couldn't load the forecast.</p>;
  const eventDays = data.days.filter((d) => d.events.length > 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="card border border-black/5 py-3 dark:border-white/10">
        <p className="text-sm">
          Lowest point in the next 30 days:{' '}
          <span
            className={clsx(
              'tabular font-semibold',
              data.minDay.endBalanceCents < 0 ? 'text-state-hold' : '',
            )}
          >
            {formatCents(data.minDay.endBalanceCents)}
          </span>{' '}
          on {formatShort(data.minDay.dateISO)}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          Projected at your current allowance spend rate. Safe-to-Spend already accounts for this.
        </p>
      </div>
      <div className="card divide-y divide-black/5 p-0 dark:divide-white/5">
        {eventDays.map((d) => (
          <div key={d.dateISO} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {formatShort(d.dateISO)}
              </span>
              <span className="tabular text-[11px] text-ink-faint">
                balance {formatCents(d.endBalanceCents)}
              </span>
            </div>
            {d.events.map((e) => (
              <div key={`${e.id}-${e.label}`} className="flex justify-between text-sm">
                <span className={clsx(e.amountCents > 0 && 'font-medium text-accent')}>{e.label}</span>
                <span className="tabular">{formatCents(e.amountCents, { sign: e.amountCents > 0 })}</span>
              </div>
            ))}
          </div>
        ))}
        {eventDays.length === 0 && (
          <p className="px-4 py-3 text-sm text-ink-faint">
            No scheduled money events in the next 30 days.
          </p>
        )}
      </div>
    </div>
  );
}

function GoalsTab() {
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('/api/goals') });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', targetAmount: '', monthlyContribution: '' });

  const create = useMutation({
    mutationFn: () =>
      api('/api/goals', {
        method: 'POST',
        json: {
          name: form.name,
          targetAmount: form.targetAmount,
          monthlyContribution: form.monthlyContribution || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setAdding(false);
      setForm({ name: '', targetAmount: '', monthlyContribution: '' });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (goals.isLoading) return <p className="text-center text-ink-faint">Loading goals…</p>;

  return (
    <div className="flex flex-col gap-3">
      {(goals.data ?? []).map((g) => {
        const pct = Math.min(100, g.eta.percentComplete);
        return (
          <div key={g.id} className="card">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="font-medium">{g.name}</h3>
              <button
                className="text-ink-faint hover:text-state-hold"
                title="Delete goal"
                onClick={() => {
                  if (confirm(`Delete goal “${g.name}”?`)) remove.mutate(g.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="tabular text-ink-soft dark:text-gray-300">
                {formatCents(toCents(g.fundedAmount))} of {formatCents(toCents(g.targetAmount))} · {pct}%
              </span>
              <span className="font-medium">
                {g.eta.etaISO
                  ? `ETA ${formatShort(g.eta.etaISO)}${
                      g.eta.monthsRemaining && g.eta.monthsRemaining > 11
                        ? ` ${g.eta.etaISO.slice(0, 4)}`
                        : ''
                    }`
                  : 'No ETA — add a monthly amount'}
              </span>
            </div>
            {toCents(g.monthlyContribution) > 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                {formatCents(toCents(g.monthlyContribution))}/month — reserved from Safe-to-Spend
                until contributed
              </p>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="card flex flex-col gap-2">
          <input
            className="input"
            placeholder="Goal name (e.g. House down payment)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Target amount (e.g. 5000.00)"
            inputMode="decimal"
            value={form.targetAmount}
            onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
          />
          <input
            className="input"
            placeholder="Monthly contribution (optional)"
            inputMode="decimal"
            value={form.monthlyContribution}
            onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })}
          />
          {create.isError && (
            <p className="text-xs text-state-hold">
              {create.error instanceof Error ? create.error.message : 'Could not save'}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              disabled={create.isPending || !form.name || !/^\d+(\.\d{1,2})?$/.test(form.targetAmount)}
              onClick={() => create.mutate()}
            >
              Create goal
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost self-start text-sm" onClick={() => setAdding(true)}>
          + New goal
        </button>
      )}
    </div>
  );
}

function RecurringTab() {
  const qc = useQueryClient();
  const streams = useQuery({ queryKey: ['recurring'], queryFn: () => api<Stream[]>('/api/recurring') });
  const patch = useMutation({
    mutationFn: (vars: { id: string; status: 'confirmed' | 'dismissed' }) =>
      api(`/api/recurring/${vars.id}`, { method: 'PATCH', json: { status: vars.status } }),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (streams.isLoading) return <p className="text-center text-ink-faint">Loading…</p>;
  const all = streams.data ?? [];
  const detected = all.filter((s) => s.status === 'detected');
  const confirmed = all.filter((s) => s.status === 'confirmed');

  // Subscription manager: non-essential recurring outflows with true cost.
  const PER_MONTH: Record<string, number> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    semi_monthly: 2,
    monthly: 1,
    annual: 1 / 12,
    irregular: 0,
  };
  const subs = confirmed
    .filter((s) => s.direction === 'outflow' && !s.isEssential)
    .map((s) => {
      const monthlyCents = Math.round(toCents(s.averageAmount) * (PER_MONTH[s.frequency] ?? 0));
      const priceUp =
        s.lastAmount !== null &&
        toCents(s.lastAmount) >= toCents(s.averageAmount) * 1.07 &&
        toCents(s.lastAmount) - toCents(s.averageAmount) >= 100;
      return { ...s, monthlyCents, verdict: priceUp ? ('review' as const) : ('keep' as const) };
    })
    .sort((a, b) => b.monthlyCents - a.monthlyCents);
  const subsMonthly = subs.reduce((t, s) => t + s.monthlyCents, 0);

  return (
    <div className="flex flex-col gap-4">
      {subs.length > 0 && (
        <section>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Subscriptions · {formatCents(subsMonthly)}/mo · {formatCents(subsMonthly * 12)}/yr
          </h3>
          <div className="card divide-y divide-black/5 p-0 dark:divide-white/5">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{s.description}</p>
                  <p className="text-xs text-ink-faint">
                    <span className="tabular">{formatCents(s.monthlyCents)}/mo</span> ·{' '}
                    <span className="tabular">{formatCents(s.monthlyCents * 12)}/yr</span>
                    {s.verdict === 'review' && s.lastAmount && (
                      <span className="text-state-tight">
                        {' '}
                        · price up: last charge {formatCents(toCents(s.lastAmount))}
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                    s.verdict === 'keep'
                      ? 'bg-accent-soft text-accent dark:bg-accent/20'
                      : 'bg-state-tight/10 text-state-tight',
                  )}
                >
                  {s.verdict}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {detected.length > 0 && (
        <section>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-state-tight">
            Needs confirmation
          </h3>
          <div className="card divide-y divide-black/5 p-0 dark:divide-white/5">
            {detected.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    Looks like {s.direction === 'inflow' ? 'income' : 'a bill'}: {s.description}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {formatCents(toCents(s.averageAmount))} {s.frequency.replace('_', '-')}
                  </p>
                </div>
                <button
                  className="btn-ghost text-accent"
                  title="Confirm"
                  onClick={() => patch.mutate({ id: s.id, status: 'confirmed' })}
                >
                  <Check size={16} />
                </button>
                <button
                  className="btn-ghost text-state-hold"
                  title="Dismiss"
                  onClick={() => patch.mutate({ id: s.id, status: 'dismissed' })}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Confirmed
        </h3>
        <div className="card divide-y divide-black/5 p-0 dark:divide-white/5">
          {confirmed.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={clsx('text-sm', s.direction === 'inflow' && 'font-medium text-accent')}>
                  {s.description}
                </p>
                <p className="text-xs text-ink-faint">
                  {s.frequency.replace('_', '-')}
                  {s.nextExpectedDate && <> · next {formatShort(s.nextExpectedDate)}</>}
                  {s.isEssential && ' · essential'}
                </p>
              </div>
              <span className="tabular text-sm">
                {formatCents(
                  s.direction === 'inflow' ? toCents(s.averageAmount) : -toCents(s.averageAmount),
                  { sign: s.direction === 'inflow' },
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
