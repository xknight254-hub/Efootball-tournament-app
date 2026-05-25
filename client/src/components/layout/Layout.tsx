import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Dropdown, DropdownItem, DropdownDivider, DropdownLabel } from '../ui/Dropdown';

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/tournaments', label: 'Tournaments', icon: '🏆' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '📊' },
];

export function Sidenav() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <aside className="fixed left-0 top-[var(--navbar-height)] bottom-0 w-[var(--sidenav-width)] z-40 overflow-hidden flex flex-col"
      style={{ background: 'var(--color-bg-card)', borderRight: '1px solid var(--color-border)' }}>
      
      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <span className="text-white font-bold text-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}>E</span>
        </div>
        <div>
          <span className="text-white font-bold text-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}>eFootball</span>
          <span className="text-[#22c55e] font-bold text-sm" style={{ fontFamily: 'Orbitron, sans-serif' }}> Arena</span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
              style={isActive ? { background: 'rgba(99,102,241,0.12)' } : {}}
            >
              <span className="text-base">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: '#6366f1', boxShadow: '0 0 8px rgba(99,102,241,0.6)' }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-4 space-y-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        {user?.isAdmin && (
          <Link to="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-amber-400 hover:text-amber-300 transition-colors">
            <span>🛡️</span> Admin Panel
          </Link>
        )}
        <Link to="/about" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
          <span>ℹ️</span> About
        </Link>
        <Link to="/privacy" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
          <span>🔒</span> Privacy
        </Link>
      </div>
    </aside>
  );
}

export function Topbar() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[var(--navbar-height)]"
      style={{ background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between h-full px-[var(--content-padding)]">
        {/* Left: Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search tournaments, players..."
              className="input-field pl-10 py-2 text-sm"
              style={{ background: 'var(--color-bg-surface)' }}
            />
          </div>
        </div>

        {/* Right: Auth */}
        <div className="flex items-center gap-3 ml-4">
          {isLoading ? (
            <div className="w-20 h-8 skeleton" />
          ) : isAuthenticated && user ? (
            <Dropdown
              trigger={
                <div className="flex items-center gap-2 cursor-pointer">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[var(--color-text-secondary)] font-medium hidden sm:block">{user.username}</span>
                  <svg className="w-4 h-4" style={{ color: 'var(--color-text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              }
            >
              <DropdownLabel>Account</DropdownLabel>
              {user.isAdmin && <DropdownItem icon={<span>🛡️</span>} onClick={() => window.location.href = '/admin'}>Admin Panel</DropdownItem>}
              <DropdownItem icon={<span>👤</span>} onClick={() => window.location.href = '/profile'}>Profile</DropdownItem>
              <DropdownItem icon={<span>⚙️</span>} onClick={() => window.location.href = '/profile'}>Settings</DropdownItem>
              <DropdownDivider />
              <DropdownItem icon={<span>🚪</span>} onClick={logout} danger>Logout</DropdownItem>
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
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar />
      <Sidenav />
      <main className="min-h-screen" style={{
        marginTop: 'var(--navbar-height)',
        marginLeft: 'var(--sidenav-width)',
        background: 'var(--color-bg)',
      }}>
        <div className="max-w-[1600px] mx-auto" style={{ padding: 'var(--content-padding)' }}>
          {children}
        </div>
      </main>
    </>
  );
}
