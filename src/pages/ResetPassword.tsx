import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Beer } from 'lucide-react'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, newPassword: password })
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: any) {
      setError(err.message || 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-background text-center space-y-3">
        <p className="text-destructive">Invalid reset link.</p>
        <Link to="/forgot-password" className="text-sm text-gold hover:underline">Request a new one</Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Beer className="h-8 w-8 text-gold" />
            <h1 className="text-3xl font-bold text-gold">GAFL</h1>
          </div>
          <p className="text-muted-foreground text-sm">Set a new password</p>
        </div>

        {done ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 text-center space-y-1">
            <p className="text-sm font-medium text-green-400">Password updated!</p>
            <p className="text-xs text-muted-foreground">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              className="bg-card border-border"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="bg-card border-border"
            />
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-black hover:bg-gold/90 font-semibold border-0"
            >
              {loading ? 'Saving…' : 'Set New Password'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Link expired?{' '}
              <Link to="/forgot-password" className="text-gold hover:underline">Request a new one</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
