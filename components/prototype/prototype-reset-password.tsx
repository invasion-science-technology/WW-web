"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function PrototypeResetPassword() {
  const { updatePassword, signOut, ready } = usePrototypeAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!ready) return;

    const client = getSupabaseClient();
    if (!client) {
      setChecking(false);
      return;
    }

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const fromRecoveryLink =
      hash.includes("type=recovery") || hash.includes("type=magiclink");

    client.auth.getSession().then(({ data }) => {
      setHasRecoverySession(Boolean(data.session) || fromRecoveryLink);
      setChecking(false);
    });
  }, [ready]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);

      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }

      setBusy(true);
      try {
        const result = await updatePassword(password);
        if (!result.ok) {
          setError(result.error ?? "Could not update password.");
          return;
        }
        await signOut();
        setInfo("Password updated. Sign in with your new password.");
        setPassword("");
        setConfirm("");
      } finally {
        setBusy(false);
      }
    },
    [password, confirm, updatePassword, signOut],
  );

  if (checking || !ready) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
      </div>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Reset link required
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Open the link from your password reset email, or request a new one from the sign-in
            page.
          </p>
          <Link
            href="/prototype/"
            className="mt-6 inline-block text-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (info) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
          <p className="text-sm text-[var(--color-accent)]" role="status">
            {info}
          </p>
          <Link
            href="/prototype/"
            className="mt-6 inline-block w-full text-center rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Field lab
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Enter a new password for your account (at least 8 characters).
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
            New password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-dim)]"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
            Confirm password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-dim)]"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
