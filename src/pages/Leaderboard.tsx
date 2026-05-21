import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SEGMENTS } from '@/lib/segments'
import { Link } from 'react-router-dom'

interface StandingRow {
  userId: number
  username: string
  overall: number
  seg1: number
  seg2: number
  seg3: number
}

const TABS = [
  { key: 'overall', label: 'Overall' },
  { key: 'seg1', label: 'Seg 1' },
  { key: 'seg2', label: 'Seg 2' },
  { key: 'seg3', label: 'Seg 3' },
]

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'overall' | 'seg1' | 'seg2' | 'seg3'>('overall')

  const { data: standings, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api.get<StandingRow[]>('/fantasy/standings'),
    refetchInterval: 5 * 60 * 1000,
  })

  const sorted = [...(standings || [])].sort((a, b) => b[tab] - a[tab])

  return (
    <div className="pb-24 px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gold">Standings</h1>
          <p className="text-xs text-muted-foreground">2026 Season · Half-PPR</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link to="/lineup" className="text-xs text-gold hover:underline">Set Lineup →</Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
            {dataUpdatedAt ? timeAgo(dataUpdatedAt) : ''}
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
              tab === t.key ? 'bg-gold text-black border-gold' : 'border-border text-muted-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'overall' && (
        <p className="text-xs text-muted-foreground">
          {SEGMENTS[parseInt(tab.replace('seg', '')) - 1].startDate} – {SEGMENTS[parseInt(tab.replace('seg', '')) - 1].endDate}
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-card animate-pulse" />)}
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="pt-6 pb-6 text-center space-y-2">
            <Trophy className="h-10 w-10 mx-auto text-gold/20" />
            <p className="text-sm text-muted-foreground">No lineups submitted yet</p>
            <p className="text-xs text-muted-foreground">Standings update once members set their weekly lineups.</p>
          </CardContent>
        </Card>
      )}

      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((s, i) => {
            const pts = s[tab]
            const isMe = s.userId === user?.id
            return (
              <div
                key={s.userId}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border',
                  i === 0 ? 'border-gold bg-gold/5' : 'border-border bg-card',
                  isMe ? 'ring-1 ring-gold/40' : ''
                )}
              >
                <span className={cn(
                  'text-lg font-bold w-6 text-center',
                  i === 0 ? 'text-gold' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-muted-foreground'
                )}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium text-sm truncate', isMe ? 'text-gold' : '')}>
                    {s.username}{isMe ? ' (you)' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gold">{pts.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">pts</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
