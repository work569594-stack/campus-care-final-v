import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setSessionToken } from '@/src/lib/api';
import type { Profile } from '@/src/types/campus';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  enrollment_no: string | null;
  user_metadata?: {
    full_name?: string | null;
    enrollment_no?: string | null;
  };
}

interface AuthResponsePayload {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    enrollment_no: string | null;
  } | null;
  profile: Profile | null;
  isAdmin: boolean;
  sessionToken?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (params: {
    full_name: string;
    enrollment_no: string;
    email: string;
    password: string;
  }) => Promise<AuthUser>;
  adminSignIn: (email: string, password: string) => Promise<AuthUser>;
  claimAdmin: (params: {
    full_name: string;
    email: string;
    password: string;
  }) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUser(raw: AuthResponsePayload['user']): AuthUser | null {
  if (!raw) return null;
  return {
    ...raw,
    user_metadata: {
      full_name: raw.full_name,
      enrollment_no: raw.enrollment_no,
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyAuthPayload = useCallback((payload: AuthResponsePayload): AuthUser | null => {
    const nextUser = normalizeUser(payload.user);
    if (!nextUser) {
      setSessionToken(null);
    } else if (payload.sessionToken) {
      setSessionToken(payload.sessionToken);
    }
    setUser(nextUser);
    setProfile(payload.profile ?? null);
    setIsAdmin(Boolean(payload.isAdmin));
    return nextUser;
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const payload = await apiFetch<AuthResponsePayload>('/api/auth/me');
      applyAuthPayload(payload);
    } catch {
      setSessionToken(null);
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
    }
  }, [applyAuthPayload]);

  useEffect(() => {
    let active = true;
    apiFetch<AuthResponsePayload>('/api/auth/me')
      .then((payload) => {
        if (!active) return;
        applyAuthPayload(payload);
      })
      .catch(() => {
        if (!active) return;
        setSessionToken(null);
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyAuthPayload]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const payload = await apiFetch<AuthResponsePayload>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const nextUser = applyAuthPayload(payload);
      if (!nextUser) {
        throw new Error('Unable to establish user session.');
      }
      return nextUser;
    },
    [applyAuthPayload],
  );

  const signUp = useCallback(
    async (params: {
      full_name: string;
      enrollment_no: string;
      email: string;
      password: string;
    }): Promise<AuthUser> => {
      const payload = await apiFetch<AuthResponsePayload>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      const nextUser = applyAuthPayload(payload);
      if (!nextUser) {
        throw new Error('Unable to create user session.');
      }
      return nextUser;
    },
    [applyAuthPayload],
  );

  const adminSignIn = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const payload = await apiFetch<AuthResponsePayload>('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const nextUser = applyAuthPayload(payload);
      if (!nextUser) {
        throw new Error('Unable to establish staff session.');
      }
      return nextUser;
    },
    [applyAuthPayload],
  );

  const claimAdmin = useCallback(
    async (params: {
      full_name: string;
      email: string;
      password: string;
    }): Promise<AuthUser> => {
      const payload = await apiFetch<AuthResponsePayload>('/api/auth/admin/claim', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      const nextUser = applyAuthPayload(payload);
      if (!nextUser) {
        throw new Error('Unable to establish staff admin session.');
      }
      return nextUser;
    },
    [applyAuthPayload],
  );

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionToken(null);
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        loading,
        configured: true,
        signIn,
        signUp,
        adminSignIn,
        claimAdmin,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
