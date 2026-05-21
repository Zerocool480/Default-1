import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Beer } from 'lucide-react'

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', sleeperUsername: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ token: string; user: any }>('/auth/register', form)
      login(res.token, res.user)
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
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
          <p className="text-muted-foreground text-sm">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Username"
            value={form.username}
            onChange={set('username')}
            required
            className="bg-card border-border"
          />
          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={set('email')}
            required
            className="bg-card border-border"
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={set('password')}
            required
            className="bg-card border-border"
          />
          <div>
            <Input
              placeholder="Sleeper username (optional)"
              value={form.sleeperUsername}
              onChange={set('sleeperUsername')}
              className="bg-card border-border"
            />
            <p className="text-[11px] text-muted-foreground mt-1 px-1">
              Links your Sleeper account for fantasy scoring
            </p>
          </div>
          {error && <p className="text-destructive text-sm text-center">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-black hover:bg-gold/90 font-semibold border-0"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already a member?{' '}
          <Link to="/login" className="text-gold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
