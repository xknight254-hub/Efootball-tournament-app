import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Dropdown, DropdownItem, DropdownDivider, DropdownLabel } from '../ui/Dropdown';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '../ui/Skeleton';

const navItems = [
  { path: '/', label: 'Home' },
  { path: '/tournaments', label: 'Tournaments' },
  { path: '/wagers', label: 'Wagers' },
  { path: '/leaderboard', label: 'Leaderboard' },
];

/* ============================================
   SIDENAV
   ============================================ */
interface SidenavProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidenav: React.FC<SidenavProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuth();

  // Close on route change (mobile)
  useEffect(() => { onClose(); }, [location.pathname]);

  // Close on Escape key (a11y)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-[var(--navbar-height)] bottom-0 z-40 overflow-hidden flex flex-col transition-transform duration-300
          lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{
          width: 'var(--sidenav-width)',
          background: 'var(--color-bg-card)',
          borderRight: '1px solid var(--color-border)',
        }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: '#F97316' }}
          >
            <span className="text-black font-bold text-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}>E</span>
          </div>
          <div>
            <span className="text-white font-bold text-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}>eFootball</span>
            <span className="text-[#22c55e] font-bold text-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}> Arena</span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1" role="menubar">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                role="menuitem"
                aria-label={item.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'text-white'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.03)]'
                }`}
                style={isActive ? { background: 'rgba(249,115,22,0.12)' } : {}}
              >
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <div
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: '#F97316', boxShadow: '0 0 8px rgba(249,115,22,0.6)' }}
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-3 py-4 space-y-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          {user?.isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-amber-400 hover:text-amber-300 transition-colors"
              aria-label="Admin Panel"
            >
              Admin Panel
            </Link>
          )}
          <Link
            to="/about"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            About
          </Link>
          <Link
            to="/privacy"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Privacy
          </Link>
        </div>
      </aside>
    </>
  );
};

/* ============================================
   TOPBAR
   ============================================ */
interface TopbarProps {
  onToggleSidenav: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleSidenav }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/tournaments?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-[var(--navbar-height)]"
      style={{ background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-border)' }}
      role="banner"
    >
      <div className="flex items-center justify-between h-full px-[var(--content-padding)]">
        {/* Left: Hamburger + Search */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidenav}
            className="lg:hidden p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <form onSubmit={handleSearch} className="relative hidden sm:block" role="search" aria-label="Search tournaments">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--color-text-dim)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search tournaments, players..."
              className="input-field pl-10 py-2 text-sm"
              style={{ background: 'var(--color-bg-surface)' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search tournaments and players"
            />
          </form>
        </div>

        {/* Right: Auth */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Skeleton className="w-20 h-8" variant="button" />
          ) : isAuthenticated && user ? (
            <Dropdown
              trigger={
                <div className="flex items-center gap-2 cursor-pointer" role="button" aria-haspopup="true" aria-expanded="false">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: '#F97316' }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[var(--color-text-secondary)] font-medium hidden sm:block">
                    {user.username}
                  </span>
                  <svg className="w-4 h-4" style={{ color: 'var(--color-text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              }
            >
              <DropdownLabel>Account</DropdownLabel>
              {user.isAdmin && (
                <DropdownItem onClick={() => navigate('/admin')}>
                  Admin Panel
                </DropdownItem>
              )}
              <DropdownItem onClick={() => navigate('/profile')}>
                Profile
              </DropdownItem>
              <DropdownItem onClick={() => navigate('/my-wagers')}>
                My Wagers
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={logout} danger>
                Logout
              </DropdownItem>
            </Dropdown>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <button className="btn-ghost text-sm">Login</button>
              </Link>
              <Link to="/register">
                <button className="btn-primary text-sm">Sign Up</button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

/* ============================================
   LAYOUT
   ============================================ */
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export function Layout({ children, showSidenav = true }: { children: React.ReactNode; showSidenav?: boolean }) {
  const [sidenavOpen, setSidenavOpen] = useState(false);
  const location = useLocation();

  // Close sidenav on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 1024) setSidenavOpen(false);
  }, [location.pathname]);

  return (
    <div>
      <Topbar onToggleSidenav={() => setSidenavOpen(prev => !prev)} />
      {showSidenav && (
        <Sidenav isOpen={sidenavOpen} onClose={() => setSidenavOpen(false)} />
      )}
      <main
        className="min-h-screen transition-all duration-300"
        style={{
          marginTop: 'var(--navbar-height)',
          marginLeft: showSidenav ? '0' : '0',
          /* On lg+ screens show margin for sidenav */
        }}
        role="main"
      >
        {/* CSS mobile override for sidenav margin on lg+ */}
        <style>{`
          @media (min-width: 1024px) {
            main[role="main"] { margin-left: ${showSidenav ? 'var(--sidenav-width)' : '0'} !important; }
          }
        `}</style>
        <div className="max-w-[1600px] mx-auto w-full" style={{ padding: 'var(--content-padding)' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
