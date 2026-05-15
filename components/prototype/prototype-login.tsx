"use client";

import { useCallback, useState } from "react";

import PrototypeEmailVerify from "@/components/prototype/prototype-email-verify";
import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

type Tab = "signin" | "signup" | "forgot";

export default function PrototypeLogin() {
  const { mode, expectedEmail, signIn, signUp, requestPasswordReset } = usePrototypeAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [awaitingVerificationEmail, setAwaitingVerificationEmail] = useState<string | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);
      setBusy(true);

      try {
        if (tab === "forgot") {
          const result = await requestPasswordReset(email);
          if (!result.ok) {
            setError(result.error ?? "Could not send reset email.");
            return;
          }
          setInfo(
            "If an account exists for that email, we sent a reset link. Check your inbox (and spam).",
          );
          return;
        }

        if (tab === "signup") {
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }
          const result = await signUp(email, password);
          if (!result.ok) {
            setError(result.error ?? "Sign-up failed.");
            return;
          }
          if (result.needsEmailConfirmation) {
            setAwaitingVerificationEmail(email.trim());
            return;
          }
          setInfo(
            "Account created. You can sign in once an admin approves your access.",
          );
          setTab("signin");
          return;
        }

        const result = await signIn(email, password);
        if (!result.ok) {
          if (result.needsEmailConfirmation) {
            setAwaitingVerificationEmail(email.trim());
            return;
          }
          setError(result.error ?? "Invalid email or password.");
        }
      } finally {
        setBusy(false);
      }
    },
    [tab, email, password, confirm, signIn, signUp, requestPasswordReset],
  );

  if (awaitingVerificationEmail) {
    return <PrototypeEmailVerify email={awaitingVerificationEmail} />;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Field lab · {mode === "supabase" ? "Account" : "Demo"}
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
          {tab === "signin"
            ? "Sign in"
            : tab === "signup"
              ? "Create account"
              : "Reset password"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {mode === "supabase" ? (
            <>
              Sign up for the no-pay prototype. New accounts stay <strong className="text-[var(--color-text-primary)]">pending</strong> until
              an admin approves them.
            </>
          ) : (
            <>
              Demo mode: single shared account. Set Supabase env vars for real sign-up and approval. Default:{" "}
              <span className="font-mono text-[var(--color-text-primary)] text-xs">{expectedEmail}</span>
            </>
          )}
        </p>

        {mode === "supabase" ? (
          <div className="mt-5 flex rounded-xl border border-[var(--color-border)] p-1 bg-[var(--color-background)]">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === "signin"
                  ? "bg-[var(--color-accent)] text-[#052e16]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === "signup"
                  ? "bg-[var(--color-accent)] text-[#052e16]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Sign up
            </button>
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === "demo" ? expectedEmail : "you@example.com"}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-dim)]"
            />
          </label>
          {tab !== "forgot" ? (
            <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Password
              <input
                type="password"
                required
                minLength={mode === "supabase" ? 8 : 1}
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-dim)]"
              />
            </label>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              We will email a link to set a new password. The link opens the Field lab reset page.
            </p>
          )}
          {tab === "signin" && mode === "supabase" ? (
            <button
              type="button"
              onClick={() => {
                setTab("forgot");
                setError(null);
                setInfo(null);
              }}
              className="text-sm text-[var(--color-accent)] hover:underline -mt-2"
            >
              Forgot password?
            </button>
          ) : null}
          {tab === "signup" && mode === "supabase" ? (
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
          ) : null}
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-sm text-[var(--color-accent)]" role="status">
              {info}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy
              ? "Please wait…"
              : tab === "signin"
                ? "Sign in"
                : tab === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </button>
        </form>

        {tab === "forgot" ? (
          <button
            type="button"
            onClick={() => {
              setTab("signin");
              setError(null);
              setInfo(null);
            }}
            className="mt-4 w-full text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Back to sign in
          </button>
        ) : null}

        {mode === "demo" ? (
          <p className="mt-5 text-[11px] text-[var(--color-text-secondary)] leading-relaxed border-t border-[var(--color-border)] pt-4">
            Demo password:{" "}
            <span className="font-mono text-[var(--color-text-primary)]">
              {process.env.NEXT_PUBLIC_PROTO_PASSWORD ? "••••••••" : "weedwatch"}
            </span>
            . If you were signed in automatically, use <strong className="text-[var(--color-text-primary)]">Sign out</strong> in the header.
          </p>
        ) : null}
      </div>
    </div>
  );
}
