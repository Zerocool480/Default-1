import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiError } from './lib/api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { TodayPage } from './pages/Today';
import { ActivityPage } from './pages/Activity';
import { PlanPage } from './pages/Plan';
import { CopilotPage } from './pages/Copilot';
import { SettingsPage } from './pages/Settings';
import { ScorePage } from './pages/Score';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
      staleTime: 30_000,
    },
  },
});

export interface Me {
  id: string;
  email: string;
}

function Gate() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/auth/me'),
    retry: false,
  });

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-faint">
        Loading…
      </div>
    );
  }
  if (me.isError) return <LoginPage />;

  return (
    <Layout email={me.data!.email}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/plan/*" element={<PlanPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/score" element={<ScorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
