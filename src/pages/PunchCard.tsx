import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import PunchCardDisplay from '@/components/PunchCardDisplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QrCode, Camera } from 'lucide-react'

const ADMIN_TAPS_REQUIRED = 5

export default function PunchCard() {
  const [tapCount, setTapCount] = useState(0)
  const [scanMode, setScanMode] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: card } = useQuery({
    queryKey: ['punchcard'],
    queryFn: () => api.get<{ visits: number; completedAt: string | null }>('/punchcard/my'),
  })

  const scanMutation = useMutation({
    mutationFn: (code: string) =>
      api.post<{ message: string; card: any }>('/punchcard/scan', { code }),
    onSuccess: data => {
      setMessage(data.message)
      setError('')
      setManualCode('')
      setScanMode(false)
      queryClient.invalidateQueries({ queryKey: ['punchcard'] })
    },
    onError: (err: any) => {
      setError(err.message)
      setMessage('')
    },
  })

  function handleTitleTap() {
    const newCount = tapCount + 1
    setTapCount(newCount)
    if (newCount >= ADMIN_TAPS_REQUIRED) {
      navigate('/admin')
      setTapCount(0)
    }
  }

  function handleManualScan(e: React.FormEvent) {
    e.preventDefault()
    if (manualCode.trim()) {
      scanMutation.mutate(manualCode.trim())
    }
  }

  return (
    <div className="pb-24 px-4 pt-6 space-y-6 max-w-lg mx-auto">
      <div>
        <button
          onClick={handleTitleTap}
          className="text-left w-full"
          aria-label="Punch Card (tap 5 times for admin)"
        >
          <h1 className="text-xl font-bold text-gold select-none">Punch Card</h1>
        </button>
        <p className="text-sm text-muted-foreground">Scan the weekly QR code at the taproom</p>
        {tapCount > 0 && tapCount < ADMIN_TAPS_REQUIRED && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {ADMIN_TAPS_REQUIRED - tapCount} more tap{ADMIN_TAPS_REQUIRED - tapCount !== 1 ? 's' : ''}...
          </p>
        )}
      </div>

      <PunchCardDisplay visits={card?.visits || 0} completed={(card?.visits || 0) >= 10} />

      {(card?.visits || 0) < 10 && (
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full border-gold text-gold gap-2"
            onClick={() => setScanMode(!scanMode)}
          >
            <Camera className="h-4 w-4" />
            {scanMode ? 'Cancel Scan' : 'Scan QR Code'}
          </Button>

          {scanMode && (
            <div className="rounded-lg border border-border p-4 bg-card text-center">
              <div id="qr-reader" className="w-full" />
              <p className="text-xs text-muted-foreground mt-2">
                Point your camera at the brewery QR code
              </p>
              <p className="text-xs text-muted-foreground mt-1">Or enter the code manually below</p>
            </div>
          )}

          <form onSubmit={handleManualScan} className="flex gap-2">
            <Input
              placeholder="Enter code manually"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              className="bg-card border-border flex-1"
            />
            <Button
              type="submit"
              disabled={scanMutation.isPending || !manualCode.trim()}
              className="bg-gold text-black border-0"
            >
              <QrCode className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-gold bg-gold/10 px-4 py-3 text-gold text-sm font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-1">
        <p className="text-sm font-medium">How it works</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Visit Great Awakening Brewery each week</li>
          <li>• Scan the weekly QR code — one scan per week</li>
          <li>• Complete all 10 visits to join the Loyalty Prize Pool</li>
          <li>• QR codes reset every week — don't miss one!</li>
        </ul>
      </div>
    </div>
  )
}
