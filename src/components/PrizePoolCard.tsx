import { getPrizeBreakdown, getLoyaltyPool } from '@/lib/sleeper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Star, Gift } from 'lucide-react'

interface PrizePoolCardProps {
  freeLeagueBudget: number
  loyaltyParticipantCount: number
}

export default function PrizePoolCard({ freeLeagueBudget, loyaltyParticipantCount }: PrizePoolCardProps) {
  const prizes = getPrizeBreakdown(freeLeagueBudget)
  const loyalty = getLoyaltyPool(loyaltyParticipantCount)

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-gold text-base">
            <Trophy className="h-4 w-4" /> Fantasy League Prizes
          </CardTitle>
          <p className="text-xs text-muted-foreground">Sponsored by Great Awakening Brewery · Gift cards & taproom credit</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {freeLeagueBudget === 0 ? (
            <p className="text-sm text-muted-foreground">Prize amounts coming soon — check back before the season starts.</p>
          ) : (
            <>
              {prizes.segments.map(seg => (
                <div key={seg.number}>
                  <p className="text-xs text-muted-foreground mb-1">{seg.label} ({seg.startDate} – {seg.endDate})</p>
                  <div className="flex gap-3 text-xs">
                    <span className="text-yellow-400">1st ${seg.first}</span>
                    <span className="text-gray-300">2nd ${seg.second}</span>
                    <span className="text-gray-500">3rd ${seg.third}</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2">
                <p className="text-xs text-muted-foreground mb-1">Overall Season Winner</p>
                <span className="text-gold font-bold">${prizes.overall.first}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-gold text-base">
            <Star className="h-4 w-4" /> Loyalty Member Rewards
          </CardTitle>
          <p className="text-xs text-muted-foreground">Exclusive to 10-punch card completers · Sponsored by Great Awakening</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loyaltyParticipantCount === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="h-4 w-4 shrink-0" />
              Complete your punch card to unlock this prize tier.
            </div>
          ) : (
            <>
              <p className="text-xl font-bold text-gold">${loyalty.total} in prizes</p>
              {loyalty.segments.map(seg => (
                <div key={seg.number}>
                  <p className="text-xs text-muted-foreground mb-1">{seg.label}</p>
                  <div className="flex gap-3 text-xs">
                    <span className="text-yellow-400">1st ${seg.first}</span>
                    <span className="text-gray-300">2nd ${seg.second}</span>
                    <span className="text-gray-500">3rd ${seg.third}</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2">
                <p className="text-xs text-muted-foreground mb-1">Overall Season Winner</p>
                <span className="text-gold font-bold">${loyalty.overall}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
