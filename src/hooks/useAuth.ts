import { useState, useEffect, createContext, useContext } from 'react'
import { api } from '@/lib/api'

interface User {
  id: number
  username: string
  email: string
  isAdmin: boolean
  sleeperUsername: string | null
  loyaltyEligible: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('gafl_token')
    if (!token) {
      setLoading(false)
      return
    }
    api.get<User>('/auth/me')
      .then(setUser)
      .catch(() => localStorage.removeItem('gafl_token'))
      .finally(() => setLoading(false))
  }, [])

  function login(token: string, userData: User) {
    localStorage.setItem('gafl_token', token)
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('gafl_token')
    setUser(null)
  }

  return { user, loading, login, logout }
}
