import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { Button } from '../ui/Button';
import { Dropdown, DropdownItem, DropdownDivider, DropdownLabel } from '../ui/Dropdown';

export function Navbar() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/tournaments', label: 'Tournaments' },
    { path: '/leaderboard', label: 'Leaderboard' },
  ];

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch { /* ignore */ }
    logout();
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-dark-900/95 backdrop-blur-xl border-b border-dark-700/50 shadow-lg'
        : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-neon-blue flex items-center justify-center shadow-glow group-hover:shadow-glow-lg transition-shadow">
              <span className="text-white font-bold text-lg font-[Orbitron]">E</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-white font-bold text-lg font-[Orbitron] tracking-wide">eFootball</span>
              <span className="text-neon-green font-bold text-lg font-[Orbitron]"> Arena</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location.pathname === link.path
                    ? 'bg-primary-500/15 text-primary-300'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Section */}
          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <div className="w-20 h-9 skeleton" />
            ) : isAuthenticated && user ? (
              <Dropdown
                trigger={
                  <div className="flex items-center gap-2 cursor-pointer">
                    <div className="avatar avatar-sm">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-gray-300 font-medium">{user.username}</span>
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              >
                <DropdownLabel>Account</DropdownLabel>
                <DropdownItem
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                  onClick={() => window.location.href = '/profile'}
                >
                  Profile
                </DropdownItem>
                <DropdownItem
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                  onClick={() => window.location.href = '/profile'}
                >
                  Settings
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
                  onClick={handleLogout}
                  danger
                >
                  Logout
                </DropdownItem>
              </Dropdown>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden btn-ghost btn-icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-dark-900/98 backdrop-blur-xl border-b border-dark-700/50 animate-fade-in-down">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  location.pathname === link.path
                    ? 'bg-primary-500/15 text-primary-300'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="h-px bg-dark-700 my-2" />
            {isAuthenticated && user ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="avatar avatar-sm">{user.username.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="text-white text-sm font-medium">{user.username}</p>
                    <p className="text-dark-400 text-xs">{user.email}</p>
                  </div>
                </div>
                <Link to="/profile" className="block px-4 py-3 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5">
                  Profile & Settings
                </Link>
                <button onClick={handleLogout} className="w-full text-left px-4 py-3 rounded-lg text-sm text-red-400 hover:bg-red-500/10">
                  Logout
                </button>
              </>
            ) : (
              <div className="flex gap-2 px-4">
                <Link to="/login" className="flex-1">
                  <Button variant="outline" className="w-full">Login</Button>
                </Link>
                <Link to="/register" className="flex-1">
                  <Button variant="primary" className="w-full">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
