import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SEGMENTS } from '@/lib/sleeper'

interface Standing {
  rosterId: number
  displayName: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

export default function Leaderboard() {
  const [activeSegment, setActiveSegment] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api.get<{ configured: boolean; standings: Standing[] }>('/fantasy/standings'),
  })

  return (
    <div className="pb-24 px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gold">League Standings</h1>
        <p className="text-sm text-muted-foreground">NFL 2026 Season</p>
      </div>

      {/* Segment tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSegment(0)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
            activeSegment === 0 ? 'bg-gold text-black border-gold' : 'border-border text-muted-foreground'
          )}
        >
          Overall
        </button>
        {SEGMENTS.map(s => (
          <button
            key={s.number}
            onClick={() => setActiveSegment(s.number)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
              activeSegment === s.number
                ? 'bg-gold text-black border-gold'
                : 'border-border text-muted-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSegment > 0 && (
        <p className="text-xs text-muted-foreground">
          Weeks {SEGMENTS[activeSegment - 1].weeks[0]}–{SEGMENTS[activeSegment - 1].weeks[5]} •{' '}
          {SEGMENTS[activeSegment - 1].startDate} – {SEGMENTS[activeSegment - 1].endDate}
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-card animate-pulse" />
          ))}
        </div>
      )}

      {!data?.configured && !isLoading && (
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-center space-y-2">
            <Trophy className="h-10 w-10 mx-auto text-gold/20" />
            <p className="text-muted-foreground text-sm">Sleeper league not connected yet</p>
            <p className="text-xs text-muted-foreground">
              Check back once the commissioner sets up the league
            </p>
          </CardContent>
        </Card>
      )}

      {data?.configured && data.standings && (
        <div className="space-y-2">
          {data.standings.map((s, i) => (
            <div
              key={s.rosterId}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border bg-card',
                i === 0 ? 'border-gold' : 'border-border'
              )}
            >
              <span
                className={cn(
                  'text-lg font-bold w-6 text-center',
                  i === 0
                    ? 'text-gold'
                    : i === 1
                    ? 'text-gray-300'
                    : i === 2
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
                )}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{s.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.wins}W–{s.losses}L{s.ties > 0 ? `–${s.ties}T` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gold">{s.pointsFor.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
