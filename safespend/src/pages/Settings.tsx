import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Moon } from 'lucide-react';
import { api } from '../lib/api';
import { formatCents, toCents } from '@shared/money';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: string | null;
  availableBalance: string | null;
  includeInCashPool: boolean;
  institutionName: string | null;
  provider: string;
}

interface UserSettings {
  emergencyFloor: string;
  timezone: string;
  periodStrategy: string;
}

export function SettingsPage() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/api/accounts') });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<UserSettings>('/api/settings') });

  const patchAccount = useMutation({
    mutationFn: (vars: { id: string; includeInCashPool: boolean }) =>
      api(`/api/accounts/${vars.id}`, { method: 'PATCH', json: { includeInCashPool: vars.includeInCashPool } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const patchSettings = useMutation({
    mutationFn: (json: Partial<UserSettings>) => api('/api/settings', { method: 'PATCH', json }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const logout = useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const [floor, setFloor] = useState<string | null>(null);
  const floorValue = floor ?? settings.data?.emergencyFloor ?? '';

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('safespend-theme', isDark ? 'dark' : 'light');
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <section>
        <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Accounts
        </h2>
        <div className="card divide-y divide-black/5 p-0 dark:divide-white/5">
          {(accounts.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {a.name} {a.mask && <span className="text-ink-faint">··{a.mask}</span>}
                </p>
                <p className="text-xs text-ink-faint">
                  {a.institutionName} · {a.subtype ?? a.type} ·{' '}
                  <span className="tabular">
                    {formatCents(toCents(a.availableBalance ?? a.currentBalance ?? '0.00'))}
                  </span>
                </p>
              </div>
              {a.type === 'depository' && (
                <label className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <input
                    type="checkbox"
                    checked={a.includeInCashPool}
                    onChange={(e) =>
                      patchAccount.mutate({ id: a.id, includeInCashPool: e.target.checked })
                    }
                  />
                  spendable
                </label>
              )}
            </div>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-ink-faint">
          “Spendable” accounts feed Safe-to-Spend. Bank connections (Plaid) arrive with milestone
          M6 — these accounts are demo data until then.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Engine
        </h2>
        <div className="card flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Emergency floor
              <span className="block text-xs text-ink-faint">
                Cash the engine will never count as spendable
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input
                className="input w-28 text-right"
                inputMode="decimal"
                value={floorValue}
                onChange={(e) => setFloor(e.target.value)}
              />
              <button
                className="btn-primary"
                disabled={
                  patchSettings.isPending ||
                  floor === null ||
                  !/^\d+(\.\d{1,2})?$/.test(floorValue) ||
                  floorValue === settings.data?.emergencyFloor
                }
                onClick={() => patchSettings.mutate({ emergencyFloor: floorValue })}
              >
                Save
              </button>
            </span>
          </label>
          <p className="text-xs text-ink-faint">
            Timezone: {settings.data?.timezone} · Period: {settings.data?.periodStrategy?.replace('_', ' ')}
          </p>
        </div>
      </section>

      <section className="flex gap-2">
        <button className="btn-ghost" onClick={toggleTheme}>
          <Moon size={15} /> Toggle theme
        </button>
        <button className="btn-ghost text-state-hold" onClick={() => logout.mutate()}>
          <LogOut size={15} /> Sign out
        </button>
      </section>
    </div>
  );
}
