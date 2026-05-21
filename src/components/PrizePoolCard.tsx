import { getPrizeBreakdown, getLoyaltyPool } from '@/lib/sleeper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Star } from 'lucide-react'

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
            <Trophy className="h-4 w-4" /> Free League Prizes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {prizes.segments.map(seg => (
            <div key={seg.number}>
              <p className="text-xs text-muted-foreground mb-1">{seg.label} ({seg.startDate} – {seg.endDate})</p>
              <div className="flex gap-2 text-xs">
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
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-gold text-base">
            <Star className="h-4 w-4" /> Loyalty Pool ({loyaltyParticipantCount} members × $53)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xl font-bold text-gold">${loyalty.total} total</p>
          {loyalty.segments.map(seg => (
            <div key={seg.number}>
              <p className="text-xs text-muted-foreground mb-1">{seg.label}</p>
              <div className="flex gap-2 text-xs">
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
        </CardContent>
      </Card>
    </div>
  )
}
