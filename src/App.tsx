import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, useAuthState } from '@/hooks/useAuth'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import PunchCard from '@/pages/PunchCard'
import Leaderboard from '@/pages/Leaderboard'
import LoyaltyLeaderboard from '@/pages/LoyaltyLeaderboard'
import Admin from '@/pages/Admin'
import BottomNav from '@/components/BottomNav'

const queryClient = new QueryClient()

function AppRoutes() {
  const auth = useAuthState()

  if (auth.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-gold text-2xl font-bold">GAFL</div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <Routes>
            <Route path="/login" element={!auth.user ? <Login /> : <Navigate to="/" />} />
            <Route path="/register" element={!auth.user ? <Register /> : <Navigate to="/" />} />
            <Route path="/" element={auth.user ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="/punchcard" element={auth.user ? <PunchCard /> : <Navigate to="/login" />} />
            <Route path="/leaderboard" element={auth.user ? <Leaderboard /> : <Navigate to="/login" />} />
            <Route path="/loyalty" element={auth.user ? <LoyaltyLeaderboard /> : <Navigate to="/login" />} />
            <Route path="/admin" element={auth.user?.isAdmin ? <Admin /> : <Navigate to="/" />} />
          </Routes>
          {auth.user && <BottomNav />}
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  )
}
