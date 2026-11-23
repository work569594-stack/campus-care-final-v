import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { MitsLogo } from '@/src/components/MitsLogo';
import { useAuth } from '@/src/context/AuthContext';
import { useSound } from '@/src/context/SoundContext';
import { useToast } from '@/src/context/ToastContext';
import { apiFetch } from '@/src/lib/api';
import { studentSignInSchema, studentSignUpSchema } from '@/src/lib/validation';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function StudentLoginPage() {
  const [searchParams] = useSearchParams();
  const nextUrl = searchParams.get('next') || '/report';

  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const { play } = useSound();
  const { pushToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [enrollmentNo, setEnrollmentNo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate(nextUrl, { replace: true });
    }
  }, [user, navigate, nextUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'forgot') {
        if (!email.trim()) {
          throw new Error('Enter your email address to check recovery options.');
        }
        const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        });
        play('success');
        setInfoMsg(res.message);
        return;
      }

      if (mode === 'signup') {
        const parsed = studentSignUpSchema.safeParse({
          full_name: fullName,
          enrollment_no: enrollmentNo,
          email,
          password,
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Invalid signup details');
        }
        await signUp(parsed.data);
        play('success');
        pushToast({
          title: 'Account created and signed in',
          variant: 'success',
        });
        navigate(nextUrl, { replace: true });
        return;
      }

      const parsed = studentSignInSchema.safeParse({ email, password });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid credentials');
      }

      await signIn(parsed.data.email, parsed.data.password);
      play('success');
      pushToast({
        title: 'Signed in to CampusCare',
        variant: 'success',
      });
      navigate(nextUrl, { replace: true });
    } catch (err) {
      play('error');
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-12">
      <div className="glass-card rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 border border-white/10 shadow-2xl">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <MitsLogo size={48} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              {mode === 'signin'
                ? 'Student Sign In'
                : mode === 'signup'
                  ? 'Create Student Account'
                  : 'Reset Password'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              CampusCare · MITS Gwalior Student Portal
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-amber-400/35 bg-amber-500/12 px-3.5 py-2.5 text-xs text-amber-200"
          >
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/12 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="st-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  id="st-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Sharma"
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div>
                <label htmlFor="st-enroll" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Enrollment Number
                </label>
                <input
                  id="st-enroll"
                  type="text"
                  required
                  value={enrollmentNo}
                  onChange={(e) => setEnrollmentNo(e.target.value)}
                  placeholder="0901CS231045"
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm font-mono-tabular text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="st-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              id="st-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@mitsgwalior.in"
              className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="st-pass" className="text-xs font-medium text-slate-300">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setInfoMsg(null);
                      setMode('forgot');
                    }}
                    className="text-[11px] text-cyan-300 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="st-pass"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'signup' ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
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
              {mode === 'signup' && (
                <p className="text-[11px] text-slate-400 mt-1">Minimum 8 characters</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold btn-gradient text-white flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {mode === 'signin'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Check Recovery Info'}
            </span>
          </button>
        </form>

        <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-2 text-center text-xs text-slate-400">
          {mode === 'signin' ? (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setInfoMsg(null);
                setMode('signup');
              }}
              className="hover:text-white"
            >
              New to CampusCare? <span className="text-cyan-300 font-medium">Create student account</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setInfoMsg(null);
                setMode('signin');
              }}
              className="hover:text-white"
            >
              Already registered? <span className="text-cyan-300 font-medium">Sign in</span>
            </button>
          )}

          <Link to="/admin/login" className="text-slate-500 hover:text-slate-300">
            Staff? Admin login
          </Link>
        </div>
      </div>
    </div>
  );
}
