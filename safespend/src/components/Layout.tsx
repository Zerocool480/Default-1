import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, CalendarRange, MessageCircle, Settings, Sun } from 'lucide-react';
import clsx from 'clsx';
import { AffordCheck } from './AffordCheck';

const tabs = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/copilot', label: 'Copilot', icon: MessageCircle },
  { to: '/plan', label: 'Plan', icon: CalendarRange },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: { children: ReactNode; email: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col md:max-w-5xl md:flex-row md:gap-8 md:px-6">
      {/* Desktop rail */}
      <nav className="hidden md:flex md:w-48 md:flex-col md:gap-1 md:pt-10">
        <div className="mb-6 px-3 text-lg font-semibold tracking-tight">SafeSpend</div>
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                isActive
                  ? 'bg-accent-soft text-accent dark:bg-accent/20'
                  : 'text-ink-soft hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5',
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 px-4 pb-24 pt-6 md:px-0 md:pb-10 md:pt-10">{children}</main>

      <AffordCheck />

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-white/10 dark:bg-surface-dark/90 md:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 px-3 pb-2 pt-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-accent-strong dark:text-accent-soft' : 'text-ink-faint',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-accent-soft dark:bg-accent/20',
                    )}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
