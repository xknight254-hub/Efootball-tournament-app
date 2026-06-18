import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TelegramProvider } from './context/TelegramContext';
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
import { JoinTournamentPage } from './pages/JoinTournamentPage';
import { WagersPage } from './pages/WagersPage';
import { WagerDetailPage } from './pages/WagerDetailPage';
import { MyWagersPage } from './pages/MyWagersPage';

function PlaceholderPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <span className="text-2xl font-extrabold text-[var(--color-text-dim)]">?</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{desc}</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Layout showSidenav><HomePage /></Layout>} />
        <Route path="/tournaments" element={<Layout showSidenav><TournamentsPage /></Layout>} />
        <Route path="/tournaments/:id" element={<Layout showSidenav><TournamentDetailPage /></Layout>} />
        <Route path="/profile" element={<Layout showSidenav><ProfilePage /></Layout>} />
        <Route path="/admin" element={<Layout showSidenav><AdminDashboard /></Layout>} />
        <Route path="/join/:token" element={<JoinTournamentPage />} />
        <Route path="/wagers" element={<Layout showSidenav><WagersPage /></Layout>} />
        <Route path="/wagers/:id" element={<Layout showSidenav><WagerDetailPage /></Layout>} />
        <Route path="/my-wagers" element={<Layout showSidenav><MyWagersPage /></Layout>} />
        <Route path="/leaderboard" element={<Layout showSidenav><PlaceholderPage title="Leaderboard" desc="Global player rankings coming soon" /></Layout>} />
        <Route path="/about" element={<Layout showSidenav={false}><PlaceholderPage title="About" desc="eFootball Arena — The ultimate competitive tournament platform" /></Layout>} />
        <Route path="/privacy" element={<Layout showSidenav={false}><PlaceholderPage title="Privacy Policy" desc="Your privacy is important to us." /></Layout>} />
        <Route path="/terms" element={<Layout showSidenav={false}><PlaceholderPage title="Terms of Service" desc="By using eFootball Arena, you agree to these terms." /></Layout>} />
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
