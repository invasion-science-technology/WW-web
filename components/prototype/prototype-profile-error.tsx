"use client";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypeProfileError() {
  const { profileLoadError, refreshProfile, signOut } = usePrototypeAuth();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl space-y-4">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Could not load your profile
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {profileLoadError ??
            "Your session is active but the profile record could not be loaded."}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          This can happen after a network error, missing database row, or RLS misconfiguration.
          Try again or sign out and back in.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
