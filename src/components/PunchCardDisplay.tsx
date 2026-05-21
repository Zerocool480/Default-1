import { cn } from '@/lib/utils'
import { Beer } from 'lucide-react'

interface PunchCardDisplayProps {
  visits: number
  completed?: boolean
}

export default function PunchCardDisplay({ visits, completed }: PunchCardDisplayProps) {
  return (
    <div className={cn('rounded-xl border p-4', completed ? 'border-gold bg-gold/10' : 'border-border bg-card')}>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'aspect-square rounded-full border-2 flex items-center justify-center transition-all',
              i < visits
                ? 'border-gold bg-gold/20 text-gold'
                : 'border-border text-muted-foreground/30'
            )}
          >
            {i < visits ? (
              <Beer className="h-5 w-5" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-current" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-sm text-muted-foreground">
        {completed ? (
          <span className="text-gold font-semibold">Complete! You're in the loyalty pool!</span>
        ) : (
          `${visits} / 10 visits`
        )}
      </div>
    </div>
  )
}
