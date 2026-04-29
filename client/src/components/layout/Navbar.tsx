import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { isAuthenticated, getCurrentUser, clearAuth, api } from '../../api';

export function Navbar() {
  const location = useLocation();
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
    setUser(getCurrentUser());
  }, [location]);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      // Ignore errors
    }
    clearAuth();
    setLoggedIn(false);
    setUser(null);
  };

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/tournaments', label: 'Tournaments' },
    { path: '/teams', label: 'Teams' },
    { path: '/about', label: 'About' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-900/90 backdrop-blur-xl border-b border-dark-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-neon-blue flex items-center justify-center">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <span className="text-white font-bold text-xl group-hover:gradient-text transition-all">
              eFootball Arena
            </span>
          </Link>
          
          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location.pathname === link.path
                    ? 'bg-primary/20 text-primary'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          
          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            {loggedIn ? (
              <>
                <span className="text-gray-400 text-sm">
                  Hi, <span className="text-primary">{user?.username}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-dark-700/50 transition-all duration-200"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white transition-all duration-200"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-lg text-sm font-medium btn-glow text-white"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}