import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatCents, toCents } from '@shared/money';
import { formatShort } from '@shared/dates';

interface Txn {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: string; // Plaid sign: + outflow
  isPending: boolean;
  source: string;
  excludeFromEngine: boolean;
  categoryId: string | null;
  categoryName: string | null;
  isDiscretionary: boolean;
  categorySource: string;
  accountName: string;
  accountType: string;
}

interface Category {
  id: string;
  name: string;
  kind: string;
  isDiscretionary: boolean;
}

export function ActivityPage() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);

  const txns = useQuery({ queryKey: ['transactions'], queryFn: () => api<Txn[]>('/api/transactions') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/api/categories') });

  const patch = useMutation({
    mutationFn: (vars: { id: string; categoryId?: string; excludeFromEngine?: boolean; makeRule?: boolean }) =>
      api(`/api/transactions/${vars.id}`, { method: 'PATCH', json: { ...vars, id: undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['engine'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
    },
  });

  const reviewCount = useMemo(
    () => (txns.data ?? []).filter((t) => t.categorySource === 'none').length,
    [txns.data],
  );

  const grouped = useMemo(() => {
    const list = (txns.data ?? []).filter((t) => !reviewOnly || t.categorySource === 'none');
    const map = new Map<string, Txn[]>();
    for (const t of list) {
      const g = map.get(t.date) ?? [];
      g.push(t);
      map.set(t.date, g);
    }
    return [...map.entries()];
  }, [txns.data, reviewOnly]);

  if (txns.isLoading) return <p className="pt-16 text-center text-ink-faint">Loading activity…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Activity</h1>

      {reviewCount > 0 && (
        <button
          onClick={() => setReviewOnly(!reviewOnly)}
          className={clsx(
            'card flex items-center gap-2 border py-3 text-left text-sm',
            reviewOnly ? 'border-accent' : 'border-state-tight/40',
          )}
        >
          <AlertCircle size={16} className="text-state-tight" />
          <span className="flex-1">
            {reviewCount} transaction{reviewCount === 1 ? '' : 's'} need{reviewCount === 1 ? 's' : ''} a category
          </span>
          <span className="text-xs text-ink-faint">{reviewOnly ? 'show all' : 'review'}</span>
        </button>
      )}

      {grouped.map(([date, list]) => {
        const daySpend = list
          .filter((t) => t.isDiscretionary && !t.excludeFromEngine && toCents(t.amount) > 0)
          .reduce((s, t) => s + toCents(t.amount), 0);
        return (
          <section key={date}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {formatShort(date)}
              </h2>
              {daySpend > 0 && (
                <span className="tabular text-xs text-ink-faint">
                  {formatCents(daySpend)} discretionary
                </span>
              )}
            </div>
            <div className="card divide-y divide-black/5 p-0 dark:divide-white/5">
              {list.map((t) => {
                const cents = toCents(t.amount);
                const isOpen = openId === t.id;
                return (
                  <div key={t.id}>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => setOpenId(isOpen ? null : t.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={clsx('truncate text-sm', t.isPending && 'opacity-60')}>
                          {t.merchantName ?? t.name}
                          {t.isPending && (
                            <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-[10px] uppercase dark:bg-white/10">
                              pending
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-ink-faint">
                          {t.categoryName ?? 'Needs category'} · {t.accountName}
                          {t.excludeFromEngine && ' · excluded'}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          'tabular text-sm',
                          cents < 0 ? 'font-medium text-accent' : '',
                          t.isPending && 'opacity-60',
                        )}
                      >
                        {formatCents(-cents, { sign: cents < 0 })}
                      </span>
                    </button>

                    {isOpen && categories.data && (
                      <TxnEditor
                        txn={t}
                        categories={categories.data}
                        busy={patch.isPending}
                        onSave={(categoryId, makeRule) =>
                          patch.mutate({ id: t.id, categoryId, makeRule }, { onSuccess: () => setOpenId(null) })
                        }
                        onToggleExclude={() =>
                          patch.mutate({ id: t.id, excludeFromEngine: !t.excludeFromEngine })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TxnEditor({
  txn,
  categories,
  busy,
  onSave,
  onToggleExclude,
}: {
  txn: Txn;
  categories: Category[];
  busy: boolean;
  onSave: (categoryId: string, makeRule: boolean) => void;
  onToggleExclude: () => void;
}) {
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? '');
  const [makeRule, setMakeRule] = useState(txn.categorySource === 'none');
  const merchant = txn.merchantName ?? txn.name;

  return (
    <div className="flex flex-col gap-3 bg-surface-raised px-4 py-3 dark:bg-surface-dark">
      <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="" disabled>
          Choose a category…
        </option>
        {categories
          .filter((c) => c.kind !== 'transfer')
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-ink-soft dark:text-gray-300">
        <input type="checkbox" checked={makeRule} onChange={(e) => setMakeRule(e.target.checked)} />
        Always categorize “{merchant}” like this
      </label>
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={busy || !categoryId || categoryId === txn.categoryId}
          onClick={() => onSave(categoryId, makeRule)}
        >
          Save
        </button>
        <button className="btn-ghost text-xs" disabled={busy} onClick={onToggleExclude}>
          {txn.excludeFromEngine ? 'Include in engine' : 'Exclude from engine'}
        </button>
      </div>
    </div>
  );
}
