import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  LogOut,
  Menu,
  Shield,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MitsLogo } from '@/src/components/MitsLogo';
import { useAuth } from '@/src/context/AuthContext';
import { useSound } from '@/src/context/SoundContext';

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Report Issue', to: '/report' },
  { label: 'Track Ticket', to: '/track' },
  { label: '3D Campus', to: '/campus-3d' },
];

export function Navbar() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { enabled, toggle } = useSound();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Student';

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#05070D]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: MITS Logo + Divider + CampusCare Wordmark */}
        <Link
          to="/"
          className="flex items-center gap-3 whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
        >
          <MitsLogo size={32} />
          <span className="h-5 w-px bg-white/15" aria-hidden="true" />
          <span className="font-display text-lg font-semibold tracking-tight text-white group-hover:text-cyan-200 transition-colors">
            CampusCare
          </span>
        </Link>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm font-medium whitespace-nowrap shrink-0 transition-colors relative py-1 ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Sound Toggle + Primary Auth Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-sound="toggle"
            onClick={toggle}
            aria-label={enabled ? 'Mute interface sounds' : 'Unmute interface sounds'}
            title={enabled ? 'Sound effects on' : 'Sound effects muted'}
            className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            {enabled ? <Volume2 className="w-4 h-4 text-cyan-300" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-[11px] font-semibold text-white flex items-center justify-center">
                  {initials || 'U'}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 mt-2 w-56 glass-card rounded-2xl p-1.5 shadow-2xl border border-white/10 z-50">
                    <div className="px-3 py-2 border-b border-white/[0.07]">
                      <p className="text-xs font-medium text-white truncate">{displayName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/track"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.07] rounded-xl mt-1"
                    >
                      <ClipboardList className="w-4 h-4 text-cyan-400" />
                      My reports
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.07] rounded-xl"
                      >
                        <Shield className="w-4 h-4 text-violet-400" />
                        Admin Dashboard
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-amber-300 hover:bg-white/[0.07] rounded-xl"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 rounded-xl text-sm font-medium btn-gradient text-white whitespace-nowrap shrink-0"
            >
              Student Login
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            className="md:hidden w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-slate-200"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-white/[0.08] bg-[#05070D] px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-white/[0.06]"
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-violet-300 hover:bg-white/[0.06]"
            >
              Admin Dashboard
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
