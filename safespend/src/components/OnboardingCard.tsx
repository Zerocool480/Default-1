import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { api } from '../lib/api';

interface Account {
  id: string;
}
interface Stream {
  direction: 'inflow' | 'outflow';
  status: string;
}
interface Goal {
  id: string;
}

/**
 * Guides a fresh account to a trustworthy number (M10). Order matters:
 * income confirmation defines the engine period, so it precedes everything
 * else being believable. Disappears once setup is complete.
 */
export function OnboardingCard() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/api/accounts') });
  const recurring = useQuery({ queryKey: ['recurring'], queryFn: () => api<Stream[]>('/api/recurring') });
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('/api/goals') });

  if (!accounts.data || !recurring.data || !goals.data) return null;

  const steps = [
    {
      label: 'Connect a bank',
      done: accounts.data.length > 0,
      to: '/settings',
      hint: 'Your accounts power everything else.',
    },
    {
      label: 'Confirm your income',
      done: recurring.data.some((s) => s.direction === 'inflow' && s.status === 'confirmed'),
      to: '/plan',
      hint: 'Your paycheck schedule sets the “days until payday” math.',
    },
    {
      label: 'Confirm your bills',
      done: recurring.data.some((s) => s.direction === 'outflow' && s.status === 'confirmed'),
      to: '/plan',
      hint: 'Confirmed bills are reserved before anything counts as spendable.',
    },
    {
      label: 'Add a first goal',
      done: goals.data.length > 0,
      to: '/plan',
      hint: 'Give your money a direction — even a small one.',
    },
  ];
  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;

  return (
    <section className="card border border-accent/30">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        Make your number trustworthy · {steps.length - remaining.length}/{steps.length}
      </h2>
      <div className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <Link key={s.label} to={s.to} className="flex items-start gap-2 text-sm">
            {s.done ? (
              <Check size={15} className="mt-0.5 shrink-0 text-accent" />
            ) : (
              <Circle size={15} className="mt-0.5 shrink-0 text-ink-faint" />
            )}
            <span>
              <span className={s.done ? 'text-ink-faint line-through' : 'font-medium'}>
                {s.label}
              </span>
              {!s.done && <span className="block text-xs text-ink-faint">{s.hint}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
