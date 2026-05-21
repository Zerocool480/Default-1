import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PunchCardDisplay from '@/components/PunchCardDisplay'
import PrizePoolCard from '@/components/PrizePoolCard'
import { getCurrentNflWeek, getSegmentForWeek, getSeasonStatus } from '@/lib/nfl'
import { Trophy, Star, Users, Beer, ChevronRight, X } from 'lucide-react'

interface PublicStats {
  freeLeagueBudget: string
  loyaltyParticipantCount: number
  memberCount: number
  loyaltyEligibleCount: number
  loyaltyPaidCount: number
  maxMembers: number
  spotsRemaining: number
}

interface StandingRow {
  userId: number
  username: string
  overall: number
  seg1: number
  seg2: number
  seg3: number
}

const ONBOARDING_KEY = 'gafl_onboarding_dismissed'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const currentWeek = getCurrentNflWeek()
  const currentSegment = currentWeek ? getSegmentForWeek(currentWeek) : null
  const seasonStatus = getSeasonStatus()

  const { data: card, isLoading: cardLoading } = useQuery({
    queryKey: ['punchcard'],
    queryFn: () => api.get<{ visits: number; completedAt: string | null }>('/punchcard/my'),
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['public-stats'],
    queryFn: () => api.get<PublicStats>('/public/stats'),
  })

  const { data: standings } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api.get<StandingRow[]>('/fantasy/standings'),
  })

  const sortedStandings = [...(standings || [])].sort((a, b) => b.overall - a.overall)
  const myStanding = sortedStandings.find(s => s.userId === user?.id)
  const rank = myStanding ? sortedStandings.indexOf(myStanding) + 1 : null

  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) === '1'
  )
  function dismissOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setOnboardingDismissed(true)
  }
  const showOnboarding = !onboardingDismissed && !myStanding

  return (
    <div className="pb-24 px-4 pt-5 space-y-5 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Beer className="h-5 w-5 text-gold" />
            <h1 className="text-lg font-bold text-gold tracking-wide">Great Awakening</h1>
          </div>
          <p className="text-xs text-muted-foreground ml-7">Fantasy League 2026</p>
        </div>
        <Link to="/profile" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span className="truncate max-w-[100px]">{user?.username}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      </div>

      {/* Season status bar */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
        {seasonStatus === 'preseason' && (
          <>
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-xs text-muted-foreground">Season starts Sep 9, 2026</span>
          </>
        )}
        {seasonStatus === 'active' && currentWeek && (
          <>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs">
              <span className="text-foreground font-medium">Week {currentWeek}</span>
              <span className="text-muted-foreground"> · Segment {currentSegment} of 3</span>
            </span>
          </>
        )}
        {seasonStatus === 'complete' && (
          <>
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="text-xs text-muted-foreground">Season complete</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {statsLoading
            ? <Skeleton className="h-3 w-12" />
            : <span>{stats?.memberCount ?? '—'}<span className="text-muted-foreground/50">/{stats?.maxMembers}</span></span>
          }
        </div>
      </div>

      {/* Onboarding card — shown until first lineup is submitted */}
      {showOnboarding && (
        <div className="relative rounded-xl border border-gold/30 bg-gold/5 px-4 py-3.5 space-y-2">
          <button
            onClick={dismissOnboarding}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gold pr-6">How to play</p>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>🏈 Pick 7 players each week — QB, RB×2, WR×2, TE, FLEX</li>
            <li>🔒 Use a player once per segment, then they're locked until next segment</li>
            <li>📊 Highest points wins each segment + the overall season</li>
            <li>🍺 Scan the taproom QR code weekly to earn loyalty rewards</li>
          </ul>
          <Link
            to="/lineup"
            className="inline-flex items-center gap-1 text-xs font-semibold text-gold mt-1"
          >
            Set your Week {currentWeek ?? 1} lineup <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Punch Card */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Punch Card</h2>
          <Link to="/punchcard" className="text-xs text-gold flex items-center gap-0.5">
            Scan <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {cardLoading
          ? <Skeleton className="h-28 w-full rounded-xl" />
          : <PunchCardDisplay visits={card?.visits || 0} completed={(card?.visits || 0) >= 10} />
        }
      </div>

      {/* Fantasy Standing */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="pt-4 pb-4">
            {rank ? (
              <>
                <p className="text-xs text-muted-foreground">Your rank</p>
                <p className="text-3xl font-bold text-gold">#{rank}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {myStanding?.overall.toFixed(1)} pts overall
                </p>
              </>
            ) : (
              <div className="text-center">
                <Trophy className="h-6 w-6 mx-auto text-gold/20 mb-1" />
                <p className="text-[10px] text-muted-foreground">No lineups yet</p>
                <Link to="/lineup" className="text-[10px] text-gold underline-offset-2 underline">
                  Set lineup
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`border-border bg-card ${user?.loyaltyEligible ? 'border-gold/40' : ''}`}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Loyalty pool</p>
            {user?.loyaltyEligible ? (
              <>
                <Star className="h-5 w-5 text-gold mt-1" />
                <p className="text-xs text-gold font-medium mt-0.5">Eligible!</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold mt-0.5">{card?.visits || 0}<span className="text-sm text-muted-foreground">/10</span></p>
                <p className="text-[10px] text-muted-foreground">visits to qualify</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prize Pools */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prize Pools</h2>
        {statsLoading
          ? <div className="space-y-3"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>
          : <PrizePoolCard
              freeLeagueBudget={parseFloat(stats?.freeLeagueBudget || '0')}
              loyaltyParticipantCount={stats?.loyaltyPaidCount || 0}
            />
        }
      </div>
    </div>
  )
}
