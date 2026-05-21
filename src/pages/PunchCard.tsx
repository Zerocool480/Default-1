import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import PunchCardDisplay from '@/components/PunchCardDisplay'
import QrScanner from '@/components/QrScanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { QrCode, Camera, Lock, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const ADMIN_TAPS_REQUIRED = 5

export default function PunchCard() {
  const [tapCount, setTapCount] = useState(0)
  const [scanMode, setScanMode] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [showPasscodeDialog, setShowPasscodeDialog] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [passcodeLoading, setPasscodeLoading] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { login } = useAuth()

  const { data: card } = useQuery({
    queryKey: ['punchcard'],
    queryFn: () => api.get<{ visits: number; completedAt: string | null }>('/punchcard/my'),
  })

  const scanMutation = useMutation({
    mutationFn: (code: string) => api.post<{ message: string; card: any }>('/punchcard/scan', { code }),
    onSuccess: (data) => {
      setScanMode(false)
      setManualCode('')
      queryClient.invalidateQueries({ queryKey: ['punchcard'] })
      toast({ title: data.message, variant: 'success' })
    },
    onError: (err: any) => {
      setScanMode(false)
      toast({ title: err.message || 'Scan failed', variant: 'destructive' })
    },
  })

  const handleScan = useCallback((code: string) => {
    scanMutation.mutate(code)
  }, [scanMutation])

  function handleTitleTap() {
    const next = tapCount + 1
    setTapCount(next)
    if (next >= ADMIN_TAPS_REQUIRED) {
      setTapCount(0)
      setShowPasscodeDialog(true)
    }
  }

  function handleManualScan(e: React.FormEvent) {
    e.preventDefault()
    if (manualCode.trim()) scanMutation.mutate(manualCode.trim())
  }

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasscodeError('')
    setPasscodeLoading(true)
    try {
      const res = await api.post<{ valid: boolean; token: string; user: any }>('/admin/verify-passcode', { passcode })
      if (res.valid) {
        login(res.token, res.user)
        setShowPasscodeDialog(false)
        setPasscode('')
        navigate('/admin')
      }
    } catch (err: any) {
      setPasscodeError(err.message || 'Invalid passcode')
    } finally {
      setPasscodeLoading(false)
    }
  }

  const visits = card?.visits || 0
  const complete = visits >= 10

  return (
    <div className="pb-24 px-4 pt-6 space-y-6 max-w-lg mx-auto">
      <div>
        <button onClick={handleTitleTap} className="text-left w-full select-none" aria-label="Punch Card">
          <h1 className="text-xl font-bold text-gold">Punch Card</h1>
        </button>
        <p className="text-sm text-muted-foreground">Scan the weekly QR code at the taproom</p>
        {tapCount > 0 && tapCount < ADMIN_TAPS_REQUIRED && (
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            {ADMIN_TAPS_REQUIRED - tapCount} more…
          </p>
        )}
      </div>

      <PunchCardDisplay visits={visits} completed={complete} />

      {!complete && (
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full border-gold text-gold gap-2"
            onClick={() => setScanMode(m => !m)}
            disabled={scanMutation.isPending}
          >
            {scanMode ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {scanMode ? 'Cancel' : 'Scan QR Code'}
          </Button>

          <QrScanner active={scanMode} onScan={handleScan} />

          <form onSubmit={handleManualScan} className="flex gap-2">
            <Input
              placeholder="Or enter code manually"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              className="bg-card border-border flex-1"
              disabled={scanMutation.isPending}
            />
            <Button
              type="submit"
              disabled={scanMutation.isPending || !manualCode.trim()}
              className="bg-gold text-black border-0 shrink-0"
            >
              <QrCode className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {complete && (
        <div className="rounded-lg border border-gold bg-gold/10 px-4 py-3 text-gold text-sm font-medium text-center">
          Punch card complete — you're in the loyalty pool!
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-1">
        <p className="text-sm font-medium">How it works</p>
        <ul className="text-xs text-muted-foreground space-y-1 mt-1">
          <li>• Visit Great Awakening Brewery each week</li>
          <li>• Scan the weekly QR code — one scan per week</li>
          <li>• Complete all 10 visits to join the Loyalty Prize Pool</li>
          <li>• QR codes reset every week — don't miss one!</li>
        </ul>
      </div>

      <Dialog
        open={showPasscodeDialog}
        onOpenChange={open => { setShowPasscodeDialog(open); setPasscode(''); setPasscodeError('') }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-gold" /> Admin Access
            </DialogTitle>
            <DialogDescription>
              Enter the commissioner passcode to access the admin panel.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasscodeSubmit} className="space-y-3 mt-2">
            <Input
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              autoFocus
              className="bg-background border-border"
            />
            {passcodeError && <p className="text-destructive text-sm">{passcodeError}</p>}
            <Button
              type="submit"
              disabled={passcodeLoading || !passcode}
              className="w-full bg-gold text-black border-0 font-semibold"
            >
              {passcodeLoading ? 'Verifying…' : 'Unlock Admin Panel'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
