import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Star, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getLoyaltyPool } from '@/lib/sleeper'

export default function LoyaltyLeaderboard() {
  const { user } = useAuth()

  const { data: prizeConfig } = useQuery({
    queryKey: ['prizeConfig-public'],
    queryFn: () =>
      api.get<{ freeLeagueBudget: string; loyaltyParticipantCount: number }>('/admin/prize-config').catch(() => null),
  })

  const pool = getLoyaltyPool(prizeConfig?.loyaltyParticipantCount || 0)

  return (
    <div className="pb-24 px-4 pt-6 space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gold flex items-center gap-2">
          <Star className="h-5 w-5" /> Loyalty Pool
        </h1>
        <p className="text-sm text-muted-foreground">For members who complete the punch card</p>
      </div>

      {/* Pool summary */}
      <Card className="border-gold bg-gold/5">
        <CardContent className="pt-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gold">${pool.total}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {prizeConfig?.loyaltyParticipantCount || 0} members × $53 ÷ 2
            </p>
          </div>
        </CardContent>
      </Card>

      {!user?.loyaltyEligible && (
        <Card className="border-border bg-card">
          <CardContent className="pt-4 flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Not yet eligible</p>
              <p className="text-xs text-muted-foreground">
                Complete your 10-visit punch card to join the loyalty pool
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.loyaltyEligible && (
        <Card className="border-gold bg-gold/10">
          <CardContent className="pt-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-gold flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gold">You're in!</p>
              <p className="text-xs text-muted-foreground">
                Your fantasy performance counts toward loyalty prizes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prize breakdown by segment */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Prize Breakdown
        </h2>
        {pool.segments.map(seg => (
          <Card key={seg.number} className="border-border bg-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm text-foreground">
                {seg.label}{' '}
                <span className="text-muted-foreground font-normal text-xs">
                  ({seg.startDate} – {seg.endDate})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">1st</p>
                  <p className="text-gold font-bold">${seg.first}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">2nd</p>
                  <p className="text-gray-300 font-semibold">${seg.second}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">3rd</p>
                  <p className="text-amber-600 font-semibold">${seg.third}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card className="border-gold bg-card">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Overall Season Winner</p>
                <p className="text-xs text-muted-foreground">Best record across all 18 weeks</p>
              </div>
              <p className="text-xl font-bold text-gold">${pool.overall}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
