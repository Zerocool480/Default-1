import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Beer, ArrowLeft } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Beer className="h-8 w-8 text-gold" />
            <h1 className="text-3xl font-bold text-gold">GAFL</h1>
          </div>
          <p className="text-muted-foreground text-sm">Reset your password</p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4 space-y-1">
              <p className="text-sm font-medium text-green-400">Check your email</p>
              <p className="text-xs text-muted-foreground">
                If <span className="text-foreground">{email}</span> is registered, a reset link is on its way. Check your spam folder if it doesn't show up.
              </p>
            </div>
            <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="bg-card border-border"
            />
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-black hover:bg-gold/90 font-semibold border-0"
            >
              {loading ? 'Sending…' : 'Send Reset Link'}
            </Button>
            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
