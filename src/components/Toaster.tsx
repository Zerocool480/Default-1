import { useEffect, useState } from 'react'
import { useToastState, type Toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const icon = toast.variant === 'success'
    ? <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
    : toast.variant === 'destructive'
    ? <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
    : <Info className="h-4 w-4 text-gold shrink-0" />

  return (
    <div
      className={cn(
        'flex items-start gap-3 w-full max-w-sm rounded-lg border bg-card px-4 py-3 shadow-lg transition-all duration-300',
        toast.variant === 'destructive' ? 'border-red-500/50' : toast.variant === 'success' ? 'border-green-500/50' : 'border-gold/30',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && <p className="text-xs text-muted-foreground mt-0.5">{toast.description}</p>}
      </div>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function Toaster() {
  const toasts = useToastState()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = toasts.filter(t => !dismissed.has(t.id))

  if (visible.length === 0) return null

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {visible.map(t => (
        <div key={t.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem
            toast={t}
            onDismiss={() => setDismissed(prev => new Set([...prev, t.id]))}
          />
        </div>
      ))}
    </div>
  )
}
