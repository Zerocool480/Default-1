import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, User, LogOut } from 'lucide-react'

export default function Profile() {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const [sleeperUsername, setSleeperUsername] = useState(user?.sleeperUsername || '')
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await api.put<any>('/auth/profile', { sleeperUsername })
      const token = localStorage.getItem('gafl_token')!
      login(token, updated)
      toast({ title: 'Profile updated', variant: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="pb-24 px-4 pt-6 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground font-normal uppercase tracking-wider">
            <User className="h-3.5 w-3.5" /> Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Username</p>
            <p className="text-sm font-medium">{user?.username}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Email</p>
            <p className="text-sm font-medium">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground font-normal uppercase tracking-wider">
            Fantasy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sleeper Username</label>
              <Input
                placeholder="Your Sleeper display name"
                value={sleeperUsername}
                onChange={e => setSleeperUsername(e.target.value)}
                className="bg-background border-border"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Must match exactly — this links your account to the Sleeper league standings.
              </p>
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-gold text-black border-0 font-semibold"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full text-destructive border-destructive/30 gap-2"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>
    </div>
  )
}
