import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { HomePage } from './pages/HomePage';
import { TournamentsPage } from './pages/TournamentsPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
        <div className="prose prose-invert text-gray-400">
          <p>Your privacy is important to us. This policy describes how we collect, use, and protect your information.</p>
          <p>We collect minimal data necessary for the operation of our services. Your personal information is never sold to third parties.</p>
          <p className="mt-4">Last updated: April 2026</p>
        </div>
      </div>
    </div>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
        <div className="prose prose-invert text-gray-400">
          <p>By using eFootball Arena, you agree to these terms. Our platform is provided for competitive gaming purposes.</p>
          <p>Users must be at least 13 years old to create an account. All participants are expected to maintain good conduct during tournaments.</p>
          <p className="mt-4">Last updated: April 2026</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-dark-900 flex flex-col">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/tournaments" element={<TournamentsPage />} />
              <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
              <Route path="/teams" element={<div className="pt-32 pb-20 text-center text-white">Teams - Coming Soon</div>} />
              <Route path="/about" element={<div className="pt-32 pb-20 text-center text-white">About - Coming Soon</div>} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;