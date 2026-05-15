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

import {
  fetchProfile,
  getSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

const DEMO_STORAGE_KEY = "weedwatch_proto_session_v2";

export type PrototypeSession = {
  email: string;
  signedInAt: string;
};

export type AuthMode = "supabase" | "demo";

export type GateState =
  | "loading"
  | "signed_out"
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
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
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

    const sync = async (session: Session | null) => {
      setSupabaseSession(session);
      if (!session?.user?.id) {
        if (!cancelled) setProfile(null);
        return;
      }
      const next = await fetchProfile(client, session.user.id);
      if (!cancelled) setProfile(next);
    };

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      void sync(data.session).finally(() => {
        if (!cancelled) setReady(true);
      });
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      void sync(session);
    });

    return () => {
      cancelled = true;
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

      if (error) return { ok: false, error: error.message };

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
