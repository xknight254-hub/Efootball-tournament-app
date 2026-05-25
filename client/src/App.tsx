import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { ToastContainer } from './components/ui/Toast';
import { useToast } from './hooks/useToast';
import { HomePage } from './pages/HomePage';
import { TournamentsPage } from './pages/TournamentsPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';

function AppContent() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<div className="min-h-screen pt-32 pb-20 text-center"><div className="glass max-w-md mx-auto p-12"><div className="text-5xl mb-4">🏆</div><h2 className="text-2xl font-bold text-white mb-2">Leaderboard</h2><p className="text-gray-400">Coming soon — global player rankings</p></div></div>} />
          <Route path="/about" element={<div className="min-h-screen pt-32 pb-20 text-center"><div className="glass max-w-md mx-auto p-12"><div className="text-5xl mb-4">⚽</div><h2 className="text-2xl font-bold text-white mb-2">About</h2><p className="text-gray-400">eFootball Arena — The ultimate competitive tournament platform for eFootball gamers.</p></div></div>} />
          <Route path="/privacy" element={<div className="min-h-screen pt-32 pb-20"><div className="max-w-3xl mx-auto px-4"><h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1><div className="prose prose-invert text-gray-400"><p>Your privacy is important to us. This policy describes how we collect, use, and protect your information.</p><p>We collect minimal data necessary for the operation of our services. Your personal information is never sold to third parties.</p><p className="mt-4">Last updated: May 2026</p></div></div></div>} />
          <Route path="/terms" element={<div className="min-h-screen pt-32 pb-20"><div className="max-w-3xl mx-auto px-4"><h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1><div className="prose prose-invert text-gray-400"><p>By using eFootball Arena, you agree to these terms. Our platform is provided for competitive gaming purposes.</p><p>Users must be at least 13 years old to create an account. All participants are expected to maintain good conduct during tournaments.</p><p className="mt-4">Last updated: May 2026</p></div></div></div>} />
        </Routes>
      </main>
      <Footer />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
