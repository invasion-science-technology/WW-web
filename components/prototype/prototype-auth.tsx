"use client";

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getPasswordResetRedirectUrl } from "@/lib/prototype/auth-url";
import { isEmailConfirmed, isUnconfirmedEmailError } from "@/lib/prototype/auth-session";
import {
  fetchProfile,
  getSupabaseClient,
  isSupabaseConfigured,
  updateProfileFields,
} from "@/lib/supabase/client";
import type { Profile, ProfileUpdate } from "@/lib/supabase/types";

export type AuthResult = { ok: boolean; error?: string; needsEmailConfirmation?: boolean };

const DEMO_STORAGE_KEY = "weedwatch_proto_session_v2";
/** Avoid infinite "Loading…" if Supabase is unreachable or getSession hangs */
const AUTH_INIT_TIMEOUT_MS = 8_000;

export type PrototypeSession = {
  email: string;
  signedInAt: string;
};

export type AuthMode = "supabase" | "demo";

export type GateState =
  | "loading"
  | "signed_out"
  | "email_unverified"
  | "pending"
  | "rejected"
  | "approved";

type PrototypeAuthContextValue = {
  mode: AuthMode;
  ready: boolean;
  gateState: GateState;
  session: PrototypeSession | null;
  supabaseSession: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  expectedEmail: string;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  resendVerificationEmail: (email: string) => Promise<AuthResult>;
  saveProfile: (fields: ProfileUpdate) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** @deprecated Use signOut */
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const PrototypeAuthContext = createContext<PrototypeAuthContextValue | null>(null);

function readDemoSession(): PrototypeSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrototypeSession;
    if (parsed && typeof parsed.email === "string") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeDemoSession(session: PrototypeSession | null) {
  try {
    if (session) sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function gateFromProfile(profile: Profile | null): GateState {
  if (!profile) return "signed_out";
  if (profile.status === "approved") return "approved";
  if (profile.status === "rejected") return "rejected";
  return "pending";
}

export function PrototypeAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const mode: AuthMode = isSupabaseConfigured() ? "supabase" : "demo";
  const expectedEmail = (
    process.env.NEXT_PUBLIC_PROTO_EMAIL?.trim().toLowerCase() ||
    "demo@weedwatch.local"
  );
  const expectedPassword =
    process.env.NEXT_PUBLIC_PROTO_PASSWORD ?? "weedwatch";

  const [ready, setReady] = useState(false);
  const [demoSession, setDemoSession] = useState<PrototypeSession | null>(null);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !supabaseSession?.user?.id) {
      setProfile(null);
      return;
    }
    const next = await fetchProfile(client, supabaseSession.user.id);
    setProfile(next);
  }, [supabaseSession?.user?.id]);

  useEffect(() => {
    if (mode === "demo") {
      queueMicrotask(() => {
        setDemoSession(readDemoSession());
        setReady(true);
      });
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      queueMicrotask(() => setReady(true));
      return;
    }

    let cancelled = false;
    let initDone = false;

    const finishInit = () => {
      if (cancelled || initDone) return;
      initDone = true;
      setReady(true);
    };

    const sync = async (session: Session | null) => {
      setSupabaseSession(session);
      if (!session?.user?.id) {
        if (!cancelled) setProfile(null);
        return;
      }
      const next = await fetchProfile(client, session.user.id);
      if (!cancelled) setProfile(next);
    };

    const timeoutId = window.setTimeout(finishInit, AUTH_INIT_TIMEOUT_MS);

    client.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        return sync(data.session);
      })
      .catch((err) => {
        console.error("[auth] getSession failed", err);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        finishInit();
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      void sync(session);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [mode]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (mode === "demo") {
        const ok =
          email.trim().toLowerCase() === expectedEmail &&
          password === expectedPassword;
        if (!ok) return { ok: false, error: "Invalid email or password." };
        const next: PrototypeSession = {
          email: email.trim(),
          signedInAt: new Date().toISOString(),
        };
        writeDemoSession(next);
        setDemoSession(next);
        return { ok: true };
      }

      const client = getSupabaseClient();
      if (!client) {
        return { ok: false, error: "Supabase is not configured." };
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (isUnconfirmedEmailError(error.message)) {
          return {
            ok: false,
            error: "Confirm your email before signing in.",
            needsEmailConfirmation: true,
          };
        }
        return { ok: false, error: error.message };
      }

      if (data.user) {
        const next = await fetchProfile(client, data.user.id);
        setProfile(next);
        setSupabaseSession(data.session);
      }

      return { ok: true };
    },
    [mode, expectedEmail, expectedPassword],
  );

  const signUp = useCallback(async (email: string, password: string) => {
    if (mode === "demo") {
      return {
        ok: false,
        error: "Sign-up requires Supabase. Configure NEXT_PUBLIC_SUPABASE_URL and ANON_KEY.",
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: "Supabase is not configured." };
    }

    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) return { ok: false, error: error.message };

    if (data.user) {
      const next = await fetchProfile(client, data.user.id);
      setProfile(next);
      setSupabaseSession(data.session);
    }

    const needsEmailConfirmation = Boolean(data.user && !data.session);
    return { ok: true, needsEmailConfirmation };
  }, [mode]);

  const resendVerificationEmail = useCallback(async (email: string) => {
    if (mode === "demo") {
      return { ok: false, error: "Email verification requires Supabase." };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: "Supabase is not configured." };
    }

    const { error } = await client.auth.resend({
      type: "signup",
      email: email.trim(),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, [mode]);

  const saveProfile = useCallback(
    async (fields: ProfileUpdate) => {
      if (mode === "demo") {
        return { ok: false, error: "Profile save requires Supabase." };
      }

      const client = getSupabaseClient();
      const userId = supabaseSession?.user?.id;
      if (!client || !userId) {
        return { ok: false, error: "Not signed in." };
      }

      const { profile: next, error } = await updateProfileFields(client, userId, fields);
      if (error) return { ok: false, error };
      if (next) setProfile(next);
      return { ok: true };
    },
    [mode, supabaseSession?.user?.id],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (mode === "demo") {
      return {
        ok: false,
        error: "Password reset requires Supabase. Configure NEXT_PUBLIC_SUPABASE_URL and ANON_KEY.",
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: "Supabase is not configured." };
    }

    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, [mode]);

  const updatePassword = useCallback(async (password: string) => {
    if (mode === "demo") {
      return { ok: false, error: "Password reset is not available in demo mode." };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: "Supabase is not configured." };
    }

    if (password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const { error } = await client.auth.updateUser({ password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, [mode]);

  const signOut = useCallback(async () => {
    if (mode === "demo") {
      writeDemoSession(null);
      setDemoSession(null);
      return;
    }

    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
    setSupabaseSession(null);
    setProfile(null);
  }, [mode]);

  const session: PrototypeSession | null = useMemo(() => {
    if (mode === "demo") return demoSession;
    if (!supabaseSession?.user?.email) return null;
    return {
      email: supabaseSession.user.email,
      signedInAt: supabaseSession.user.last_sign_in_at ?? new Date().toISOString(),
    };
  }, [mode, demoSession, supabaseSession]);

  const gateState: GateState = useMemo(() => {
    if (!ready) return "loading";
    if (mode === "demo") return demoSession ? "approved" : "signed_out";
    if (!supabaseSession) return "signed_out";
    if (!isEmailConfirmed(supabaseSession)) return "email_unverified";
    return gateFromProfile(profile);
  }, [ready, mode, demoSession, supabaseSession, profile]);

  const isAdmin = profile?.role === "admin" && profile.status === "approved";

  const value = useMemo(
    () => ({
      mode,
      ready,
      gateState,
      session,
      supabaseSession,
      profile,
      isAdmin,
      expectedEmail,
      signIn,
      signUp,
      requestPasswordReset,
      updatePassword,
      resendVerificationEmail,
      saveProfile,
      signOut,
      logout: signOut,
      refreshProfile,
    }),
    [
      mode,
      ready,
      gateState,
      session,
      supabaseSession,
      profile,
      isAdmin,
      expectedEmail,
      signIn,
      signUp,
      requestPasswordReset,
      updatePassword,
      resendVerificationEmail,
      saveProfile,
      signOut,
      refreshProfile,
    ],
  );

  return (
    <PrototypeAuthContext.Provider value={value}>
      {children}
    </PrototypeAuthContext.Provider>
  );
}

export function usePrototypeAuth(): PrototypeAuthContextValue {
  const v = useContext(PrototypeAuthContext);
  if (!v) {
    throw new Error("usePrototypeAuth must be used within PrototypeAuthProvider");
  }
  return v;
}

/** @deprecated Use usePrototypeAuth().session */
export function usePrototypeSession(): PrototypeSession | null {
  return usePrototypeAuth().session;
}
