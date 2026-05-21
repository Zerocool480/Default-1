import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getCurrentNflWeek, getSeasonStatus } from '@/lib/nfl'
import { getSegmentForWeek } from '@/lib/segments'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { Lock, Plus, X, Search, Trophy, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

type SlotType = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX'

interface Player {
  id: number
  name: string
  position: string
  team: string
}

interface SlotDef {
  slotType: SlotType
  label: string
  positions: string[]
}

const SLOT_DEFS: SlotDef[] = [
  { slotType: 'QB', label: 'QB', positions: ['QB'] },
  { slotType: 'RB', label: 'RB', positions: ['RB'] },
  { slotType: 'RB', label: 'RB', positions: ['RB'] },
  { slotType: 'WR', label: 'WR', positions: ['WR'] },
  { slotType: 'WR', label: 'WR', positions: ['WR'] },
  { slotType: 'TE', label: 'TE', positions: ['TE'] },
  { slotType: 'FLEX', label: 'FLEX', positions: ['RB', 'WR', 'TE'] },
]

interface LineupSlotData {
  playerId: number
  playerName: string
  position: string
  team: string
  slotType: SlotType
  fantasyPoints: string | null
}

export default function Lineup() {
  const qc = useQueryClient()
  const week = getCurrentNflWeek() ?? 1
  const seasonStatus = getSeasonStatus()
  const segment = getSegmentForWeek(week)

  const [lineup, setLineup] = useState<(Player | null)[]>(Array(7).fill(null))
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [pickerPosition, setPickerPosition] = useState<string>('QB')
  const [search, setSearch] = useState('')
  const [initialized, setInitialized] = useState(false)

  const { data: lineupData } = useQuery({
    queryKey: ['lineup', week],
    queryFn: () => api.get<{ lineup: any; slots: LineupSlotData[]; isLocked: boolean }>(`/fantasy/lineup/${week}`),
    onSuccess(data: { lineup: any; slots: LineupSlotData[]; isLocked: boolean }) {
      if (!initialized && data.slots?.length > 0) {
        const filledSlots = [...data.slots]
        const orderedLineup: (Player | null)[] = SLOT_DEFS.map(def => {
          const idx = filledSlots.findIndex(s => s.slotType === def.slotType)
          if (idx === -1) return null
          const s = filledSlots.splice(idx, 1)[0]
          return { id: s.playerId, name: s.playerName, position: s.position, team: s.team }
        })
        setLineup(orderedLineup)
        setInitialized(true)
      }
    },
  })

  const { data: usedPlayersData } = useQuery({
    queryKey: ['my-used'],
    queryFn: () => api.get<{ playerId: number; segmentNumber: number; week: number; name: string; position: string; team: string }[]>('/fantasy/my-used'),
  })

  const usedInSegment = useMemo(() => {
    return new Set((usedPlayersData || [])
      .filter(u => u.segmentNumber === segment)
      .map(u => u.playerId))
  }, [usedPlayersData, segment])

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ['players', pickerPosition, search],
    queryFn: () => api.get<Player[]>(`/fantasy/players?position=${pickerPosition}&search=${encodeURIComponent(search)}`),
    enabled: pickerSlot !== null,
  })

  const saveMutation = useMutation({
    mutationFn: (slots: { playerId: number; slotType: SlotType }[]) =>
      api.put(`/fantasy/lineup/${week}`, { slots }),
    onSuccess: () => {
      toast({ title: 'Lineup saved!', variant: 'success' })
      qc.invalidateQueries({ queryKey: ['lineup', week] })
      qc.invalidateQueries({ queryKey: ['my-used'] })
    },
    onError: (err: any) => {
      toast({ title: err.message || 'Save failed', variant: 'destructive' })
    },
  })

  function handleSave() {
    if (lineup.some(p => p === null)) {
      toast({ title: 'Fill all 7 slots before saving', variant: 'destructive' })
      return
    }
    const slots = lineup.map((player, i) => ({
      playerId: player!.id,
      slotType: SLOT_DEFS[i].slotType,
    }))
    saveMutation.mutate(slots)
  }

  function openPicker(slotIdx: number) {
    setPickerSlot(slotIdx)
    setPickerPosition(SLOT_DEFS[slotIdx].positions[0])
    setSearch('')
  }

  function selectPlayer(player: Player) {
    if (pickerSlot === null) return
    const newLineup = [...lineup]
    // Remove from any other slot first
    for (let i = 0; i < newLineup.length; i++) {
      if (newLineup[i]?.id === player.id) newLineup[i] = null
    }
    newLineup[pickerSlot] = player
    setLineup(newLineup)
    setPickerSlot(null)
  }

  const isLocked = lineupData?.isLocked || false
  const assignedIds = new Set(lineup.filter(Boolean).map(p => p!.id))

  if (seasonStatus === 'preseason') {
    return (
      <div className="pb-24 px-4 pt-6 space-y-4 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-gold">Set Lineup</h1>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 pb-6 text-center space-y-2">
            <Trophy className="h-10 w-10 mx-auto text-gold/20" />
            <p className="text-sm text-muted-foreground">Season starts September 9, 2026</p>
            <p className="text-xs text-muted-foreground">Come back when the season kicks off to set your first lineup.</p>
          </CardContent>
        </Card>
        <Link to="/leaderboard" className="flex items-center gap-1 text-sm text-gold">
          View Standings <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-24 px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gold">Week {week} Lineup</h1>
          <p className="text-xs text-muted-foreground">Segment {segment} · Half-PPR · 7 skill positions</p>
        </div>
        <Link to="/leaderboard" className="text-xs text-muted-foreground flex items-center gap-0.5 hover:text-foreground">
          Standings <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-600/30 bg-yellow-600/10 px-3 py-2">
          <Lock className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-xs text-yellow-400">Week {week} is locked — games have started.</p>
        </div>
      )}

      {/* Lineup slots */}
      <div className="space-y-2">
        {SLOT_DEFS.map((def, i) => {
          const player = lineup[i]
          // Find the score for this slot by matching slot type + order
          const sameTypeSlots = lineupData?.slots?.filter(s => s.slotType === def.slotType) || []
          const sameTypeDefsBefore = SLOT_DEFS.slice(0, i).filter(d => d.slotType === def.slotType).length
          const slotScore = sameTypeSlots[sameTypeDefsBefore]

          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                player ? 'border-border bg-card' : 'border-dashed border-border bg-card/50',
                isLocked ? 'opacity-80' : ''
              )}
            >
              <span className="text-[10px] font-bold text-muted-foreground w-8 text-center shrink-0">{def.label}</span>
              {player ? (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{player.name}</p>
                    <p className="text-[10px] text-muted-foreground">{player.position} · {player.team}</p>
                  </div>
                  {slotScore?.fantasyPoints && (
                    <span className="text-sm font-bold text-gold shrink-0">{parseFloat(slotScore.fantasyPoints).toFixed(1)}</span>
                  )}
                  {!isLocked && (
                    <button
                      onClick={() => { const n = [...lineup]; n[i] = null; setLineup(n) }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => !isLocked && openPicker(i)}
                  disabled={isLocked}
                  className="flex-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" /> Add {def.positions.join('/')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!isLocked && (
        <Button
          className="w-full bg-gold text-black font-semibold border-0"
          onClick={handleSave}
          disabled={saveMutation.isPending || lineup.some(p => p === null)}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Lineup'}
        </Button>
      )}

      {/* Used players reference */}
      {usedPlayersData && usedPlayersData.filter(u => u.segmentNumber === segment).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Locked this segment (Seg {segment})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {usedPlayersData.filter(u => u.segmentNumber === segment).map(u => (
              <span key={u.playerId} className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                {u.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Player picker modal/drawer */}
      {pickerSlot !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setPickerSlot(null)}>
          <div
            className="w-full max-w-lg mx-auto bg-background rounded-t-2xl border-t border-border max-h-[75vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Pick {SLOT_DEFS[pickerSlot].label}</p>
                <button onClick={() => setPickerSlot(null)} className="text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Position filter (for FLEX) */}
              {SLOT_DEFS[pickerSlot].positions.length > 1 && (
                <div className="flex gap-2">
                  {SLOT_DEFS[pickerSlot].positions.map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPickerPosition(pos)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs border transition-colors',
                        pickerPosition === pos ? 'bg-gold text-black border-gold' : 'border-border text-muted-foreground'
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 bg-card border-border"
                  placeholder="Search players…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-1">
              {playersLoading && (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-card animate-pulse" />
                  ))}
                </div>
              )}
              {!playersLoading && players?.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No players found</p>
              )}
              {players?.map(player => {
                const isUsed = usedInSegment.has(player.id) && !lineup.some(p => p?.id === player.id)
                const isAlreadyInSlot = assignedIds.has(player.id) && lineup[pickerSlot ?? -1]?.id !== player.id
                return (
                  <button
                    key={player.id}
                    disabled={isUsed || isAlreadyInSlot}
                    onClick={() => selectPlayer(player)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      isUsed || isAlreadyInSlot
                        ? 'opacity-40 cursor-not-allowed bg-card'
                        : 'bg-card hover:bg-card/80 active:bg-gold/10'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{player.name}</p>
                      <p className="text-[10px] text-muted-foreground">{player.position} · {player.team}</p>
                    </div>
                    {isUsed && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
