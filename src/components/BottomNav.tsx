import { Link, useLocation } from 'react-router-dom'
import { Home, QrCode, Trophy, Star, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/punchcard', icon: QrCode, label: 'Punch Card' },
  { to: '/leaderboard', icon: Trophy, label: 'League' },
  { to: '/loyalty', icon: Star, label: 'Loyalty' },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const { user } = useAuth()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-safe">
      <div className="flex items-center justify-around px-2 pt-2 pb-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[60px]',
              pathname === to ? 'text-gold' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}
        {user?.isAdmin && (
          <Link
            to="/admin"
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[60px]',
              pathname === '/admin' ? 'text-gold' : 'text-muted-foreground'
            )}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px] font-medium">Admin</span>
          </Link>
        )}
      </div>
    </nav>
  )
}
