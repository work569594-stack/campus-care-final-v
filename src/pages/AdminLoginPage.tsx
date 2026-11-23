import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield, ShieldCheck } from 'lucide-react';
import { MitsLogo } from '@/src/components/MitsLogo';
import { useAuth } from '@/src/context/AuthContext';
import { useSound } from '@/src/context/SoundContext';
import { useToast } from '@/src/context/ToastContext';
import { apiFetch } from '@/src/lib/api';
import { adminClaimSchema, studentSignInSchema } from '@/src/lib/validation';

interface AdminStatusResponse {
  needsAdminSetup: boolean;
  hasEnvPasscode: boolean;
}

export function AdminLoginPage() {
  const [searchParams] = useSearchParams();
  const nextUrl = searchParams.get('next') || '/admin';

  const navigate = useNavigate();
  const { user, isAdmin, adminSignIn, claimAdmin } = useAuth();
  const { play } = useSound();
  const { pushToast } = useToast();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin) {
      navigate(nextUrl, { replace: true });
    }
  }, [user, isAdmin, navigate, nextUrl]);

  useEffect(() => {
    let active = true;
    apiFetch<AdminStatusResponse>('/api/auth/admin/status')
      .then((res) => {
        if (active) setNeedsAdminSetup(res.needsAdminSetup);
      })
      .catch(() => {
        if (active) setNeedsAdminSetup(false);
      })
      .finally(() => {
        if (active) setCheckingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      if (needsAdminSetup) {
        const parsed = adminClaimSchema.safeParse({
          full_name: fullName,
          email,
          password,
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Invalid setup details');
        }
        await claimAdmin(parsed.data);
        play('success');
        pushToast({
          title: 'Staff admin account initialized',
          variant: 'success',
        });
        navigate(nextUrl, { replace: true });
        return;
      }

      const parsed = studentSignInSchema.safeParse({ email, password });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid staff credentials');
      }

      await adminSignIn(parsed.data.email, parsed.data.password);
      play('success');
      pushToast({
        title: 'Signed in to Maintenance Console',
        variant: 'success',
      });
      navigate(nextUrl, { replace: true });
    } catch (err) {
      play('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-12">
      <div className="glass-card rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 border border-violet-500/20 shadow-2xl">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <MitsLogo size={48} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 mb-1">
              <Shield className="w-3.5 h-3.5" />
              <span>Maintenance &amp; Estates Staff</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              {needsAdminSetup ? 'Claim Staff Admin Account' : 'Staff Admin Login'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {needsAdminSetup
                ? 'First-run setup: create the primary MITS Gwalior estates administrator account'
                : 'Authorized MITS Gwalior maintenance personnel only'}
            </p>
          </div>
        </div>

        {needsAdminSetup && !checkingStatus && (
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2.5 text-xs text-cyan-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-cyan-300" />
            <span>
              No staff administrator is registered yet. Claiming this form locks one-time setup
              to your chosen staff credentials.
            </span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-amber-400/40 bg-amber-500/12 px-3.5 py-2.5 text-xs text-amber-200"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsAdminSetup && (
            <div>
              <label htmlFor="adm-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Staff Name
              </label>
              <input
                id="adm-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Estates Officer"
                className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          )}

          <div>
            <label htmlFor="adm-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              Staff Email
            </label>
            <input
              id="adm-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="estates@mitsgwalior.in"
              className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label htmlFor="adm-pass" className="block text-xs font-medium text-slate-300 mb-1.5">
              {needsAdminSetup ? 'Create Admin Password (min 8 chars)' : 'Password'}
            </label>
            <div className="relative">
              <input
                id="adm-pass"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={needsAdminSetup ? 8 : 6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl bg-[#0B101D] border border-white/12 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || checkingStatus}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold btn-gradient text-white flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {needsAdminSetup ? 'Initialize Staff Admin Console' : 'Sign In to Admin Console'}
            </span>
          </button>
        </form>

        <div className="pt-2 border-t border-white/[0.08] text-center text-xs text-slate-400">
          <Link to="/login" className="hover:text-white">
            Student? <span className="text-cyan-300 font-medium">Student login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
