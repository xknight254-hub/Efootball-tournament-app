import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-dark-950 border-t border-dark-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-neon-blue flex items-center justify-center">
                <span className="text-white font-bold text-sm font-[Orbitron]">E</span>
              </div>
              <span className="text-white font-bold font-[Orbitron]">eFootball Arena</span>
            </Link>
            <p className="text-dark-400 text-sm leading-relaxed">
              The ultimate competitive platform for eFootball tournaments. Create, compete, and conquer.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Platform</h4>
            <ul className="space-y-2">
              <li><Link to="/tournaments" className="text-dark-400 hover:text-white text-sm transition-colors">Tournaments</Link></li>
              <li><Link to="/leaderboard" className="text-dark-400 hover:text-white text-sm transition-colors">Leaderboard</Link></li>
              <li><Link to="/tournaments" className="text-dark-400 hover:text-white text-sm transition-colors">Browse Open</Link></li>
              <li><Link to="/register" className="text-dark-400 hover:text-white text-sm transition-colors">Create Account</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Support</h4>
            <ul className="space-y-2">
              <li><Link to="/about" className="text-dark-400 hover:text-white text-sm transition-colors">About Us</Link></li>
              <li><Link to="/privacy" className="text-dark-400 hover:text-white text-sm transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-dark-400 hover:text-white text-sm transition-colors">Terms of Service</Link></li>
              <li><a href="#" className="text-dark-400 hover:text-white text-sm transition-colors">Contact</a></li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Community</h4>
            <div className="flex gap-3">
              <a href="#" className="w-9 h-9 rounded-lg bg-dark-800 flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all" aria-label="Discord">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-dark-800 flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all" aria-label="Twitter">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-dark-800 flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all" aria-label="YouTube">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
          </div>
        </div>

        <div className="h-px bg-dark-800 my-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-dark-500 text-sm">© 2026 eFootball Arena. All rights reserved.</p>
          <p className="text-dark-600 text-xs">Built for competitive gamers, by gamers.</p>
        </div>
      </div>
    </footer>
  );
}
