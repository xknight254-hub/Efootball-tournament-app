import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TelegramProvider, useTelegram } from './context/TelegramContext';
import { Layout } from './components/layout/Layout';
import { ToastContainer } from './components/ui/Toast';
import { useToast } from './hooks/useToast';
import { HomePage } from './pages/HomePage';
import { TournamentsPage } from './pages/TournamentsPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminDashboard } from './pages/AdminDashboard';

function PlaceholderPage({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-[var(--color-text-secondary)]">{desc}</p>
      </div>
    </div>
  );
}

function AccessDeniedScreen({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center px-6">
        <div className="text-6xl mb-6">🚫</div>
        <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>
          Access Denied
        </h1>
        <p className="text-[var(--color-text-secondary)] text-sm mb-6 max-w-sm mx-auto">
          {message}
        </p>
        <div className="rounded-xl p-4 max-w-sm mx-auto" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-[var(--color-text-muted)] text-xs">
            This Telegram Mini App is restricted to the super admin only.
            If you believe this is an error, contact the platform administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { toasts, removeToast } = useToast();
  const { error, isInTelegram } = useTelegram();

  // If in Telegram and got an access-denied error, show blocked screen
  if (isInTelegram && error && error.toLowerCase().includes('access denied')) {
    return <AccessDeniedScreen message={error} />;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Routes>
        {/* Auth pages — no layout */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

      {/* Main app — with layout */}
      <Route path="/" element={<Layout showSidenav><HomePage /></Layout>} />
      <Route path="/tournaments" element={<Layout showSidenav><TournamentsPage /></Layout>} />
      <Route path="/tournaments/:id" element={<Layout showSidenav><TournamentDetailPage /></Layout>} />
      <Route path="/profile" element={<Layout showSidenav><ProfilePage /></Layout>} />
      <Route path="/admin" element={<Layout showSidenav><AdminDashboard /></Layout>} />
      <Route path="/leaderboard" element={<Layout showSidenav><PlaceholderPage title="Leaderboard" desc="Global player rankings coming soon" icon="🏆" /></Layout>} />
      <Route path="/about" element={<Layout showSidenav={false}><PlaceholderPage title="About" desc="eFootball Arena — The ultimate competitive tournament platform" icon="⚽" /></Layout>} />
      <Route path="/privacy" element={<Layout showSidenav={false}><PlaceholderPage title="Privacy Policy" desc="Your privacy is important to us." icon="🔒" /></Layout>} />
      <Route path="/terms" element={<Layout showSidenav={false}><PlaceholderPage title="Terms of Service" desc="By using eFootball Arena, you agree to these terms." icon="📋" /></Layout>} />
      </Routes>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TelegramProvider>
          <AppContent />
        </TelegramProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
