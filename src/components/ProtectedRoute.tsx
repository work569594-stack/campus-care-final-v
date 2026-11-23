import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/src/context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full space-y-4">
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    const target = requireAdmin ? `/admin/login?next=${next}` : `/login?next=${next}`;
    return <Navigate to={target} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Access restricted to college staff</h1>
          <p className="text-sm text-slate-400">
            Your account does not hold an active maintenance administrator role in CampusCare.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              to="/"
              className="px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 text-slate-100 transition-colors"
            >
              Return Home
            </Link>
            <Link
              to="/admin/login"
              className="px-4 py-2 rounded-xl text-sm font-medium btn-gradient text-white"
            >
              Staff Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
