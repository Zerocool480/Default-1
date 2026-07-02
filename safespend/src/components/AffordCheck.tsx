import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, Check, CircleDollarSign, TriangleAlert, X } from 'lucide-react';
import { api } from '../lib/api';
import type { PurchaseEvaluation } from '@shared/scenario';

const verdictStyle = {
  yes: { badge: 'bg-accent-soft text-accent dark:bg-accent/20', icon: Check },
  tight: { badge: 'bg-state-tight/10 text-state-tight', icon: TriangleAlert },
  not_now: { badge: 'bg-state-hold/10 text-state-hold', icon: TriangleAlert },
} as const;

/** The standing-in-a-store button: one tap from anywhere (PRD G2). */
export function AffordCheck() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<PurchaseEvaluation | null>(null);
  const [bought, setBought] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const check = useMutation({
    mutationFn: () =>
      api<PurchaseEvaluation>('/api/simulate', {
        method: 'POST',
        json: { type: 'purchase', amount, label: label || undefined },
      }),
    onSuccess: setResult,
  });

  const logPurchase = useMutation({
    mutationFn: () =>
      api('/api/transactions/planned', {
        method: 'POST',
        json: { amount, name: label || 'Planned purchase' },
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setBought(true);
    },
  });

  function reset() {
    setOpen(false);
    setLabel('');
    setAmount('');
    setResult(null);
    setBought(false);
    setSkipped(false);
    check.reset();
    logPurchase.reset();
  }

  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-16 right-4 z-20 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-accent/90 md:bottom-8"
      >
        <CircleDollarSign size={17} />
        Can I afford this?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center"
          onClick={reset}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-surface p-5 dark:bg-surface-dark-raised md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Can I afford this?</h2>
              <button className="text-ink-faint" onClick={reset} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {!result ? (
              <div className="flex flex-col gap-3">
                <input
                  className="input"
                  placeholder="What is it? (optional)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Price (e.g. 449.00)"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
                {check.isError && (
                  <p className="text-xs text-state-hold">
                    {check.error instanceof Error ? check.error.message : 'Could not check'}
                  </p>
                )}
                <button
                  className="btn-primary"
                  disabled={!validAmount || check.isPending}
                  onClick={() => check.mutate()}
                >
                  {check.isPending ? 'Checking…' : 'Check'}
                </button>
              </div>
            ) : bought ? (
              <Done
                title="Logged it."
                body="Your number has already adjusted. When the real charge syncs in, you can exclude the placeholder from Activity."
                onClose={reset}
              />
            ) : skipped ? (
              <Done
                title="Nice call."
                body="That money stays working for your goals — your daily allowance is untouched."
                onClose={reset}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div
                  className={clsx(
                    'flex items-center gap-2 self-start rounded-full px-3 py-1 text-sm font-medium',
                    verdictStyle[result.verdict].badge,
                  )}
                >
                  {(() => {
                    const Icon = verdictStyle[result.verdict].icon;
                    return <Icon size={15} />;
                  })()}
                  {result.headline}
                  <span className="ml-1 text-xs font-normal uppercase opacity-70">
                    risk: {result.risk}
                  </span>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {result.impacts.map((impact, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {impact.tone === 'good' ? (
                        <Check size={15} className="mt-0.5 shrink-0 text-accent" />
                      ) : impact.tone === 'warn' ? (
                        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-state-hold" />
                      ) : (
                        <ArrowRight size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                      )}
                      <span className="text-ink-soft dark:text-gray-300">{impact.text}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-1 flex gap-2">
                  <button
                    className="btn-primary flex-1"
                    disabled={logPurchase.isPending || result.verdict === 'not_now'}
                    onClick={() => logPurchase.mutate()}
                  >
                    I bought it
                  </button>
                  <button className="btn-ghost flex-1" onClick={() => setSkipped(true)}>
                    Skipping it
                  </button>
                </div>
                {result.verdict === 'not_now' && (
                  <p className="text-center text-[11px] text-ink-faint">
                    “I bought it” is disabled when it would break commitments — your call is
                    still yours, but log it by hand if you go ahead.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Done({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <Check size={22} className="text-accent" />
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-ink-soft dark:text-gray-300">{body}</p>
      <button className="btn-primary mt-2" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
