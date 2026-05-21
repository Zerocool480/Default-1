import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Star, Lock, Gift } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getLoyaltyPool } from '@/lib/sleeper'

interface PublicStats {
  freeLeagueBudget: string
  loyaltyParticipantCount: number
  loyaltyPaidCount: number
  memberCount: number
  maxMembers: number
}

export default function LoyaltyLeaderboard() {
  const { user } = useAuth()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['public-stats'],
    queryFn: () => api.get<PublicStats>('/public/stats'),
  })

  const pool = getLoyaltyPool(stats?.loyaltyPaidCount || 0)
  const hasPool = (stats?.loyaltyPaidCount || 0) > 0

  return (
    <div className="pb-24 px-4 pt-6 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gold flex items-center gap-2">
          <Star className="h-5 w-5" /> Loyalty Rewards
        </h1>
        <p className="text-sm text-muted-foreground">Exclusive prizes for our most loyal members</p>
      </div>

      {/* How to qualify */}
      {!user?.loyaltyEligible && (
        <Card className="border-border bg-card">
          <CardContent className="pt-4 flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Not yet eligible</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete your 10-visit punch card to unlock this prize tier. Visit the taproom weekly and scan the QR code each time.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.loyaltyEligible && (
        <Card className="border-gold bg-gold/10">
          <CardContent className="pt-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-gold shrink-0" />
            <div>
              <p className="text-sm font-medium text-gold">You're in!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your fantasy league performance counts toward loyalty prizes. Keep playing!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prize pool summary */}
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <Card className="border-gold bg-gold/5">
          <CardContent className="pt-4 pb-4">
            {hasPool ? (
              <div className="text-center">
                <p className="text-3xl font-bold text-gold">${pool.total}</p>
                <p className="text-sm text-muted-foreground mt-1">in gift cards & taproom credit</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sponsored by Great Awakening Brewery · {stats?.loyaltyPaidCount} members enrolled
                </p>
              </div>
            ) : (
              <div className="text-center space-y-1.5">
                <Gift className="h-8 w-8 mx-auto text-gold/40" />
                <p className="text-sm font-medium">Prize pool announced before the season</p>
                <p className="text-xs text-muted-foreground">Funded by Great Awakening — gift cards & taproom credit</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prize breakdown */}
      {hasPool && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prize Breakdown</h2>
          {pool.segments.map(seg => (
            <Card key={seg.number} className="border-border bg-card">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm text-foreground">
                  {seg.label}{' '}
                  <span className="text-muted-foreground font-normal text-xs">({seg.startDate} – {seg.endDate})</span>
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
      )}

      {/* What counts */}
      <Card className="border-border bg-card">
        <CardContent className="pt-4 pb-4 space-y-2">
          <p className="text-sm font-medium">How loyalty prizes work</p>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>• Complete 10 weekly taproom visits to qualify</li>
            <li>• Your Sleeper fantasy record determines your loyalty ranking</li>
            <li>• Prizes awarded at the end of each 6-week segment and the full season</li>
            <li>• Gift cards & taproom credit — funded by Great Awakening Brewery</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
