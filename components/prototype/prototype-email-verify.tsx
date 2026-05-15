"use client";

import { useCallback, useState } from "react";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypeEmailVerify({
  email,
  onBackToSignIn,
}: {
  email: string;
  onBackToSignIn?: () => void;
}) {
  const { resendVerificationEmail, signOut } = usePrototypeAuth();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onResend = useCallback(async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await resendVerificationEmail(email);
      if (!result.ok) {
        setError(result.error ?? "Could not resend email.");
        return;
      }
      setInfo("Verification email sent. Check your inbox and spam folder.");
    } finally {
      setBusy(false);
    }
  }, [email, resendVerificationEmail]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Verify your email
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
          Check your inbox
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          We sent a confirmation link to{" "}
          <strong className="text-[var(--color-text-primary)]">{email}</strong>. Open it, then
          return here and sign in. An admin must still approve your account before you can use the
          Field lab.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 text-sm text-[var(--color-accent)]" role="status">
            {info}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onResend()}
          className="mt-6 w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? "Sending…" : "Resend verification email"}
        </button>
        {onBackToSignIn ? (
          <button
            type="button"
            onClick={onBackToSignIn}
            className="mt-3 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Back to sign in
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
