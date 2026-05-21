import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { QrCode, Download, RefreshCw, Users, Settings, Trophy, BarChart3, Star, Check, X } from 'lucide-react'
import { getCurrentNflWeek } from '@/lib/nfl'
import { cn } from '@/lib/utils'

interface AdminUser {
  id: number
  username: string
  email: string
  sleeperUsername: string | null
  loyaltyEligible: boolean
  createdAt: string
  punchCard: { visits: number }
}

interface LoyaltyMember {
  id: number
  username: string
  email: string
  sleeperUsername: string | null
  inPool: boolean
  hasPaid: boolean
  confirmedAt: string | null
}

interface Overview {
  memberCount: number
  maxMembers: number
  loyaltyEligibleCount: number
  loyaltyPaidCount: number
  activeQr: { weekNumber: number; expiresAt: string } | null
  freeLeagueBudget: string
  loyaltyPool: string
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'qr', label: 'QR Codes', icon: QrCode },
  { id: 'loyalty', label: 'Loyalty', icon: Star },
  { id: 'prizes', label: 'Prizes', icon: Trophy },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'league', label: 'League', icon: Settings },
] as const

type TabId = typeof tabs[number]['id']

export default function Admin() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [weekNumber, setWeekNumber] = useState(String(getCurrentNflWeek() || ''))
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [budget, setBudget] = useState('')
  const [loyaltyCount, setLoyaltyCount] = useState('')
  const [sleeperLeagueId, setSleeperLeagueId] = useState('')

  const { data: overview, isLoading: overviewLoading } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: () => api.get('/admin/overview'),
  })

  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users'),
    enabled: activeTab === 'members',
  })

  const { data: loyaltyMembers = [], isLoading: loyaltyLoading } = useQuery<LoyaltyMember[]>({
    queryKey: ['admin-loyalty'],
    queryFn: () => api.get('/admin/loyalty'),
    enabled: activeTab === 'loyalty',
  })

  const { data: prizeConfig } = useQuery<any>({
    queryKey: ['admin-prize-config'],
    queryFn: () => api.get('/admin/prize-config'),
    enabled: activeTab === 'prizes',
  })

  const { data: leagueSettings } = useQuery<any>({
    queryKey: ['admin-league-settings'],
    queryFn: () => api.get('/admin/league-settings'),
    enabled: activeTab === 'league',
  })

  const generateQR = useMutation({
    mutationFn: (week: number) => api.post<{ qr: any; qrDataUrl: string }>('/admin/qr/generate', { weekNumber: week, seasonYear: 2026 }),
    onSuccess: (data) => {
      setQrDataUrl(data.qrDataUrl)
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      toast({ title: `Week ${weekNumber} QR code generated`, variant: 'success' })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const savePrizes = useMutation({
    mutationFn: () => api.put('/admin/prize-config', { freeLeagueBudget: budget, loyaltyParticipantCount: parseInt(loyaltyCount) }),
    onSuccess: () => {
      toast({ title: 'Prize config saved', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['admin-prize-config', 'admin-overview', 'public-stats'] })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const saveLeague = useMutation({
    mutationFn: () => api.put('/admin/league-settings', { sleeperLeagueId, season: 2026 }),
    onSuccess: () => {
      toast({ title: 'League ID saved', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['admin-league-settings'] })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const confirmLoyalty = useMutation({
    mutationFn: ({ userId, hasPaid }: { userId: number; hasPaid: boolean }) =>
      api.post(`/admin/loyalty/${userId}/confirm`, { hasPaid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-loyalty', 'admin-overview', 'public-stats'] })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  return (
    <div className="pb-24 px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gold">Admin Panel</h1>
        <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-1 rounded">Commissioner</span>
      </div>

      {/* Tabs — scrollable row */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar bg-card rounded-lg p-1 border border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 px-2.5 rounded-md text-[10px] font-medium transition-colors shrink-0',
              activeTab === id ? 'bg-gold text-black' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          {overviewLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : overview && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-border bg-card">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Members</p>
                    <p className="text-3xl font-bold text-gold">{overview.memberCount}</p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gold rounded-full" style={{ width: `${(overview.memberCount / overview.maxMembers) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{overview.maxMembers - overview.memberCount} spots left</p>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Loyalty Pool</p>
                    <p className="text-3xl font-bold text-gold">{overview.loyaltyPaidCount}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{overview.loyaltyEligibleCount} eligible · ${overview.loyaltyPool} pool</p>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Free League Budget</p>
                    <p className="text-2xl font-bold text-gold">${overview.freeLeagueBudget}</p>
                  </CardContent>
                </Card>

                <Card className={cn('border-border bg-card', overview.activeQr ? 'border-green-500/30' : '')}>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Active QR</p>
                    {overview.activeQr ? (
                      <>
                        <p className="text-2xl font-bold text-green-400">Wk {overview.activeQr.weekNumber}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Expires {new Date(overview.activeQr.expiresAt).toLocaleDateString()}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">None active</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* QR Codes */}
      {activeTab === 'qr' && (
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Generate Weekly QR Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Week number (1–18)</label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={weekNumber}
                  onChange={e => setWeekNumber(e.target.value)}
                  min={1}
                  max={18}
                  className="bg-background border-border"
                />
                {getCurrentNflWeek() && (
                  <p className="text-[11px] text-muted-foreground mt-1">Current NFL week: {getCurrentNflWeek()}</p>
                )}
              </div>
              <Button
                onClick={() => generateQR.mutate(parseInt(weekNumber))}
                disabled={!weekNumber || generateQR.isPending}
                className="w-full bg-gold text-black border-0 font-semibold"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {generateQR.isPending ? 'Generating…' : 'Generate & Activate'}
              </Button>
              <p className="text-[11px] text-muted-foreground">Generating deactivates the previous week's code automatically.</p>
            </CardContent>
          </Card>

          {qrDataUrl && (
            <Card className="border-gold bg-card">
              <CardContent className="pt-4 space-y-3">
                <img src={qrDataUrl} alt="QR Code" className="w-full max-w-[280px] mx-auto rounded-lg bg-white p-3" />
                <a
                  href={qrDataUrl}
                  download={`gafl-week-${weekNumber}-qr.png`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gold/10 border border-gold text-gold text-sm font-medium"
                >
                  <Download className="h-4 w-4" /> Download for Printing
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Loyalty */}
      {activeTab === 'loyalty' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Members who completed 10 visits. Toggle <strong className="text-foreground">Paid</strong> once you've collected their $53 — the pool total updates automatically.
          </p>
          {loyaltyLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>}
          {!loyaltyLoading && loyaltyMembers.length === 0 && (
            <Card className="border-border bg-card">
              <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                <Star className="h-8 w-8 mx-auto mb-2 text-gold/20" />
                No members have completed the punch card yet.
              </CardContent>
            </Card>
          )}
          {loyaltyMembers.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.username}</p>
                <p className="text-xs text-muted-foreground truncate">{m.sleeperUsername || m.email}</p>
              </div>
              <button
                onClick={() => confirmLoyalty.mutate({ userId: m.id, hasPaid: !m.hasPaid })}
                disabled={confirmLoyalty.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  m.hasPaid
                    ? 'bg-green-500/10 border-green-500/40 text-green-400'
                    : 'bg-card border-border text-muted-foreground hover:border-gold hover:text-gold'
                )}
              >
                {m.hasPaid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {m.hasPaid ? 'Paid' : 'Unpaid'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Prizes */}
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
              <label className="text-xs text-muted-foreground mb-1 block">Loyalty reward members (paid punch cards)</label>
              <Input
                type="number"
                placeholder={prizeConfig?.loyaltyParticipantCount?.toString() || '0'}
                value={loyaltyCount}
                onChange={e => setLoyaltyCount(e.target.value)}
                className="bg-background border-border"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Budget estimate: {loyaltyCount || prizeConfig?.loyaltyParticipantCount || 0} members × avg $53 visit value ÷ 2 = <strong className="text-gold">${((parseInt(loyaltyCount || prizeConfig?.loyaltyParticipantCount || 0) * 53) / 2).toFixed(2)}</strong> suggested prize budget
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">The Loyalty tab auto-updates this count when you confirm members. Use this tab to set the actual gift card amounts you'll award.</p>
            <Button onClick={() => savePrizes.mutate()} disabled={savePrizes.isPending} className="w-full bg-gold text-black border-0 font-semibold">
              Save
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{usersLoading ? '…' : users.length} members registered</p>
            <a href="/api/admin/export/users" download className="flex items-center gap-1 text-xs text-gold">
              <Download className="h-3 w-3" /> CSV
            </a>
          </div>
          {usersLoading
            ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            : users.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{u.punchCard?.visits || 0}/10</p>
                  {u.loyaltyEligible && <p className="text-[10px] text-gold">loyalty ✓</p>}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* League */}
      {activeTab === 'league' && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sleeper League</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sleeper League ID</label>
              <Input
                placeholder={leagueSettings?.sleeperLeagueId || 'From your Sleeper league URL'}
                value={sleeperLeagueId}
                onChange={e => setSleeperLeagueId(e.target.value)}
                className="bg-background border-border font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">sleeper.com/leagues/<strong>{'<this-number>'}</strong>/…</p>
            </div>
            <Button onClick={() => saveLeague.mutate()} disabled={saveLeague.isPending || !sleeperLeagueId} className="w-full bg-gold text-black border-0 font-semibold">
              Save League ID
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
