import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QrCode, Download, RefreshCw, Users, Settings, Trophy } from 'lucide-react'

interface AdminUser {
  id: number
  username: string
  email: string
  sleeperUsername: string | null
  loyaltyEligible: boolean
  createdAt: string
  punchCard: { visits: number }
}

export default function Admin() {
  const queryClient = useQueryClient()
  const [weekNumber, setWeekNumber] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'qr' | 'prizes' | 'users' | 'league'>('qr')
  const [budget, setBudget] = useState('')
  const [loyaltyCount, setLoyaltyCount] = useState('')
  const [sleeperLeagueId, setSleeperLeagueId] = useState('')
  const [message, setMessage] = useState('')

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users'),
  })

  const { data: prizeConfig } = useQuery({
    queryKey: ['admin-prize-config'],
    queryFn: () => api.get<any>('/admin/prize-config'),
  })

  const { data: leagueSettings } = useQuery({
    queryKey: ['admin-league-settings'],
    queryFn: () => api.get<any>('/admin/league-settings'),
  })

  const generateQR = useMutation({
    mutationFn: (week: number) =>
      api.post<{ qr: any; qrDataUrl: string }>('/admin/qr/generate', { weekNumber: week, seasonYear: 2026 }),
    onSuccess: data => {
      setQrDataUrl(data.qrDataUrl)
      queryClient.invalidateQueries({ queryKey: ['admin-qr'] })
      setMessage(`QR code for week ${weekNumber} generated!`)
    },
    onError: (err: any) => setMessage(err.message),
  })

  const savePrizes = useMutation({
    mutationFn: () =>
      api.put('/admin/prize-config', {
        freeLeagueBudget: budget,
        loyaltyParticipantCount: parseInt(loyaltyCount),
      }),
    onSuccess: () => {
      setMessage('Prize config saved!')
      queryClient.invalidateQueries({ queryKey: ['admin-prize-config'] })
      queryClient.invalidateQueries({ queryKey: ['prizeConfig-public'] })
    },
    onError: (err: any) => setMessage(err.message),
  })

  const saveLeague = useMutation({
    mutationFn: () => api.put('/admin/league-settings', { sleeperLeagueId, season: 2026 }),
    onSuccess: () => {
      setMessage('League settings saved!')
      queryClient.invalidateQueries({ queryKey: ['admin-league-settings'] })
      queryClient.invalidateQueries({ queryKey: ['standings'] })
    },
    onError: (err: any) => setMessage(err.message),
  })

  const tabs = [
    { id: 'qr', label: 'QR Codes', icon: QrCode },
    { id: 'prizes', label: 'Prizes', icon: Trophy },
    { id: 'users', label: 'Members', icon: Users },
    { id: 'league', label: 'League', icon: Settings },
  ] as const

  return (
    <div className="pb-24 px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gold">Admin Panel</h1>
        <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-1 rounded">
          Commissioner
        </span>
      </div>

      {message && (
        <div className="rounded-lg bg-gold/10 border border-gold px-3 py-2 text-gold text-sm">
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-card rounded-lg p-1 border border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id)
              setMessage('')
            }}
            className={`flex flex-col items-center gap-0.5 py-2 rounded-md text-[10px] font-medium transition-colors ${
              activeTab === id ? 'bg-gold text-black' : 'text-muted-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* QR Tab */}
      {activeTab === 'qr' && (
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Generate Weekly QR Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="number"
                placeholder="Week number (1-18)"
                value={weekNumber}
                onChange={e => setWeekNumber(e.target.value)}
                min={1}
                max={18}
                className="bg-background border-border"
              />
              <Button
                onClick={() => generateQR.mutate(parseInt(weekNumber))}
                disabled={!weekNumber || generateQR.isPending}
                className="w-full bg-gold text-black border-0 font-semibold"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {generateQR.isPending ? 'Generating...' : 'Generate & Activate'}
              </Button>
            </CardContent>
          </Card>

          {qrDataUrl && (
            <Card className="border-gold bg-card">
              <CardContent className="pt-4 space-y-3">
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-full max-w-[280px] mx-auto rounded-lg bg-white p-2"
                />
                <a
                  href={qrDataUrl}
                  download={`gafl-week-${weekNumber}-qr.png`}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-gold/10 border border-gold text-gold text-sm font-medium"
                >
                  <Download className="h-4 w-4" /> Download for Printing
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Prizes Tab */}
      {activeTab === 'prizes' && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Prize Pool Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Free League Budget ($)</label>
              <Input
                type="number"
                placeholder={prizeConfig?.freeLeagueBudget || '0'}
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="bg-background border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Loyalty Participant Count</label>
              <Input
                type="number"
                placeholder={prizeConfig?.loyaltyParticipantCount?.toString() || '0'}
                value={loyaltyCount}
                onChange={e => setLoyaltyCount(e.target.value)}
                className="bg-background border-border"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Loyalty pool = {loyaltyCount || 0} × $53 ÷ 2 =${' '}
                {((parseInt(loyaltyCount) || 0) * 53 / 2).toFixed(2)}
              </p>
            </div>
            <Button
              onClick={() => savePrizes.mutate()}
              disabled={savePrizes.isPending}
              className="w-full bg-gold text-black border-0 font-semibold"
            >
              Save Prize Config
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{users.length} members registered</p>
            <a
              href="/api/admin/export/users"
              download
              className="flex items-center gap-1 text-xs text-gold"
            >
              <Download className="h-3 w-3" /> CSV
            </a>
          </div>
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{u.punchCard?.visits || 0}/10</p>
                  {u.loyaltyEligible && <p className="text-[10px] text-gold">loyalty ✓</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* League Settings Tab */}
      {activeTab === 'league' && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sleeper League</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sleeper League ID</label>
              <Input
                placeholder={leagueSettings?.sleeperLeagueId || 'Enter league ID from Sleeper URL'}
                value={sleeperLeagueId}
                onChange={e => setSleeperLeagueId(e.target.value)}
                className="bg-background border-border font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Find it in your Sleeper league URL
              </p>
            </div>
            <Button
              onClick={() => saveLeague.mutate()}
              disabled={saveLeague.isPending || !sleeperLeagueId}
              className="w-full bg-gold text-black border-0 font-semibold"
            >
              Save League ID
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
