import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import PunchCardDisplay from '@/components/PunchCardDisplay'
import PrizePoolCard from '@/components/PrizePoolCard'
import { Beer, Trophy, Star } from 'lucide-react'

export default function Dashboard() {
  const { user, logout } = useAuth()

  const { data: card } = useQuery({
    queryKey: ['punchcard'],
    queryFn: () => api.get<{ visits: number; completedAt: string | null }>('/punchcard/my'),
  })

  const { data: standings } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api.get<{ configured: boolean; standings: any[] }>('/fantasy/standings'),
  })

  const { data: prizeConfig } = useQuery({
    queryKey: ['prizeConfig-public'],
    queryFn: () =>
      api.get<{ freeLeagueBudget: string; loyaltyParticipantCount: number }>('/admin/prize-config').catch(() => null),
  })

  const myStanding = standings?.standings?.find(s => s.displayName === user?.sleeperUsername)
  const rank = myStanding ? standings!.standings!.indexOf(myStanding) + 1 : null

  return (
    <div className="pb-24 px-4 pt-6 space-y-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gold">Great Awakening</h1>
          <p className="text-sm text-muted-foreground">Fantasy League 2026</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.username}</span>
          <button onClick={logout} className="text-xs text-muted-foreground hover:text-foreground underline">
            out
          </button>
        </div>
      </div>

      {/* Punch Card Status */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
          <Beer className="h-3 w-3" /> Punch Card
        </h2>
        <PunchCardDisplay visits={card?.visits || 0} completed={card?.visits === 10} />
      </div>

      {/* Fantasy Standing */}
      {standings?.configured && myStanding && (
        <Card className="border-border bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Your Standing</p>
                <p className="text-2xl font-bold text-gold">#{rank}</p>
                <p className="text-sm text-muted-foreground">
                  {myStanding.wins}W – {myStanding.losses}L
                </p>
              </div>
              <Trophy className="h-10 w-10 text-gold/30" />
            </div>
          </CardContent>
        </Card>
      )}

      {!standings?.configured && (
        <Card className="border-border bg-card">
          <CardContent className="pt-4 text-center text-muted-foreground text-sm">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-gold/20" />
            Sleeper league connection coming soon
          </CardContent>
        </Card>
      )}

      {/* Loyalty Status */}
      {user?.loyaltyEligible && (
        <Card className="border-gold bg-gold/10">
          <CardContent className="pt-4 flex items-center gap-3">
            <Star className="h-6 w-6 text-gold flex-shrink-0" />
            <div>
              <p className="font-semibold text-gold text-sm">Loyalty Pool Member</p>
              <p className="text-xs text-muted-foreground">
                You've completed your punch card and are eligible for loyalty prizes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prize Pool */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Prize Pools
        </h2>
        <PrizePoolCard
          freeLeagueBudget={parseFloat(prizeConfig?.freeLeagueBudget || '0')}
          loyaltyParticipantCount={prizeConfig?.loyaltyParticipantCount || 0}
        />
      </div>
    </div>
  )
}
