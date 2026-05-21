import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { QrCode, Download, RefreshCw, Users, Trophy, BarChart3, Star, Check, X, Lock, Zap, Mail } from 'lucide-react'
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
  { id: 'fantasy', label: 'Fantasy', icon: Trophy },
  { id: 'loyalty', label: 'Loyalty', icon: Star },
  { id: 'prizes', label: 'Prizes', icon: Trophy },
  { id: 'members', label: 'Members', icon: Users },
] as const

type TabId = typeof tabs[number]['id']

export default function Admin() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [weekNumber, setWeekNumber] = useState(String(getCurrentNflWeek() || ''))
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [budget, setBudget] = useState('')
  const [loyaltyCount, setLoyaltyCount] = useState('')
  const [syncWeek, setSyncWeek] = useState(String(getCurrentNflWeek() || 1))
  const [overrideSearch, setOverrideSearch] = useState('')
  const [overridePlayerId, setOverridePlayerId] = useState<number | null>(null)
  const [overridePlayerName, setOverridePlayerName] = useState('')
  const [overrideWeek, setOverrideWeek] = useState(String(getCurrentNflWeek() || 1))
  const [overridePoints, setOverridePoints] = useState('')
  const [reminderWeek, setReminderWeek] = useState(String(getCurrentNflWeek() || 1))

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

  const { data: weekStatuses = [], refetch: refetchWeekStatuses } = useQuery<any[]>({
    queryKey: ['admin-week-statuses'],
    queryFn: () => api.get('/admin/fantasy/weeks'),
    enabled: activeTab === 'fantasy',
  })

  const { data: playerCounts = [] } = useQuery<{ position: string; count: string }[]>({
    queryKey: ['admin-player-counts'],
    queryFn: () => api.get('/admin/fantasy/player-counts'),
    enabled: activeTab === 'fantasy',
  })

  const { data: overrideSearchResults = [] } = useQuery<{ id: number; name: string; position: string; team: string }[]>({
    queryKey: ['player-search', overrideSearch],
    queryFn: () => api.get(`/fantasy/players?search=${encodeURIComponent(overrideSearch)}`),
    enabled: overrideSearch.length >= 2 && activeTab === 'fantasy',
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

  const confirmLoyalty = useMutation({
    mutationFn: ({ userId, hasPaid }: { userId: number; hasPaid: boolean }) =>
      api.post(`/admin/loyalty/${userId}/confirm`, { hasPaid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-loyalty', 'admin-overview', 'public-stats'] })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const syncPlayers = useMutation({
    mutationFn: () => api.post('/admin/fantasy/sync-players', {}),
    onSuccess: (data: any) => {
      toast({ title: `Synced ${data.synced} players from ESPN`, variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['admin-player-counts'] })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const syncScores = useMutation({
    mutationFn: (week: number) => api.post(`/admin/fantasy/sync-scores/${week}`, {}),
    onSuccess: (data: any) => {
      toast({ title: `Updated scores for ${data.updated} players`, variant: 'success' })
      refetchWeekStatuses()
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const lockWeek = useMutation({
    mutationFn: (week: number) => api.post(`/admin/fantasy/lock/${week}`, {}),
    onSuccess: (data: any) => {
      toast({ title: `Week locked — ${data.lineupCount} lineups recorded`, variant: 'success' })
      refetchWeekStatuses()
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const overrideScore = useMutation({
    mutationFn: () => api.put('/admin/fantasy/score', {
      playerId: overridePlayerId,
      week: parseInt(overrideWeek),
      season: 2026,
      fantasyPoints: parseFloat(overridePoints),
    }),
    onSuccess: () => {
      toast({ title: 'Score updated', variant: 'success' })
      setOverridePlayerId(null)
      setOverridePlayerName('')
      setOverrideSearch('')
      setOverridePoints('')
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const sendReminder = useMutation({
    mutationFn: (week: number) => api.post('/admin/send-reminder', { week }),
    onSuccess: (data: any) => {
      if (data.skipped) {
        toast({ title: 'SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in env to send real emails', variant: 'default' })
      } else {
        toast({ title: `Reminder sent to ${data.sent} members`, variant: 'success' })
      }
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
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
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

      {/* Fantasy Management */}
      {activeTab === 'fantasy' && (
        <div className="space-y-4">

          {/* Player Pool */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Player Pool</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                {['QB', 'RB', 'WR', 'TE'].map(pos => {
                  const c = playerCounts.find(p => p.position === pos)
                  return (
                    <div key={pos} className="bg-background rounded-lg py-2">
                      <p className="text-[10px] text-muted-foreground">{pos}</p>
                      <p className="text-lg font-bold text-gold">{c ? c.count : '—'}</p>
                    </div>
                  )
                })}
              </div>
              <Button
                onClick={() => syncPlayers.mutate()}
                disabled={syncPlayers.isPending}
                className="w-full bg-gold text-black border-0 font-semibold"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', syncPlayers.isPending && 'animate-spin')} />
                {syncPlayers.isPending ? 'Syncing from ESPN…' : 'Sync Players from ESPN'}
              </Button>
              <p className="text-[11px] text-muted-foreground">Pulls active QB/RB/WR/TE rosters. Run once before the season, then weekly for roster moves.</p>
            </CardContent>
          </Card>

          {/* Week Management */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Week Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">Week number</label>
                <Input
                  type="number"
                  min={1}
                  max={18}
                  value={syncWeek}
                  onChange={e => setSyncWeek(e.target.value)}
                  className="bg-background border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => lockWeek.mutate(parseInt(syncWeek))}
                  disabled={lockWeek.isPending || !syncWeek}
                  variant="outline"
                  className="border-yellow-600/40 text-yellow-500 hover:bg-yellow-600/10 text-xs"
                >
                  <Lock className="h-3.5 w-3.5 mr-1.5" />
                  {lockWeek.isPending ? 'Locking…' : 'Lock Week'}
                </Button>
                <Button
                  onClick={() => syncScores.mutate(parseInt(syncWeek))}
                  disabled={syncScores.isPending || !syncWeek}
                  className="bg-gold text-black border-0 text-xs font-semibold"
                >
                  <Zap className={cn('h-3.5 w-3.5 mr-1.5', syncScores.isPending && 'animate-spin')} />
                  {syncScores.isPending ? 'Syncing…' : 'Sync Scores'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Lock before Thursday kickoff. Sync scores during/after Sunday games — run multiple times.</p>

              {weekStatuses.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Week Status</p>
                  {weekStatuses.map((ws: any) => (
                    <div key={ws.week} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-background">
                      <span className="text-muted-foreground w-14">Week {ws.week}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', ws.is_locked ? 'bg-yellow-600/20 text-yellow-400' : 'bg-green-600/20 text-green-400')}>
                        {ws.is_locked ? 'Locked' : 'Open'}
                      </span>
                      {ws.scores_finalized && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-600/20 text-blue-400">Scored</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Override */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Score Override</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">Search player</label>
                <Input
                  placeholder="Player name…"
                  value={overrideSearch}
                  onChange={e => { setOverrideSearch(e.target.value); setOverridePlayerId(null); setOverridePlayerName('') }}
                  className="bg-background border-border"
                />
              </div>
              {overrideSearch.length >= 2 && !overridePlayerId && overrideSearchResults.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {overrideSearchResults.slice(0, 8).map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setOverridePlayerId(p.id); setOverridePlayerName(p.name); setOverrideSearch(p.name) }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-background hover:bg-card border border-border text-sm flex items-center justify-between"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.position} · {p.team}</span>
                    </button>
                  ))}
                </div>
              )}
              {overridePlayerId && (
                <p className="text-xs text-gold">Selected: {overridePlayerName}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Week</label>
                  <Input
                    type="number"
                    min={1}
                    max={18}
                    value={overrideWeek}
                    onChange={e => setOverrideWeek(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Fantasy pts</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 24.5"
                    value={overridePoints}
                    onChange={e => setOverridePoints(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
              </div>
              <Button
                onClick={() => overrideScore.mutate()}
                disabled={overrideScore.isPending || !overridePlayerId || !overridePoints}
                className="w-full bg-gold text-black border-0 font-semibold"
              >
                {overrideScore.isPending ? 'Saving…' : 'Override Score'}
              </Button>
            </CardContent>
          </Card>

          {/* Email Reminders */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lineup Reminder Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Week</label>
                <Input
                  type="number"
                  min={1}
                  max={18}
                  value={reminderWeek}
                  onChange={e => setReminderWeek(e.target.value)}
                  className="bg-background border-border"
                />
              </div>
              <Button
                onClick={() => sendReminder.mutate(parseInt(reminderWeek))}
                disabled={sendReminder.isPending || !reminderWeek}
                variant="outline"
                className="w-full border-gold/40 text-gold hover:bg-gold/10"
              >
                <Mail className="h-4 w-4 mr-2" />
                {sendReminder.isPending ? 'Sending…' : `Send Week ${reminderWeek} Reminder to All Members`}
              </Button>
              <p className="text-[11px] text-muted-foreground">Configure SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM in your environment variables to enable real emails. Without them, this logs to the server console.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
