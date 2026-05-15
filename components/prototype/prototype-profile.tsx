"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypeProfile() {
  const { profile, session, saveProfile, refreshProfile } = usePrototypeAuth();
  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setOrganization(profile?.organization ?? "");
  }, [profile]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);
      setBusy(true);
      try {
        const result = await saveProfile({
          display_name: displayName,
          organization,
        });
        if (!result.ok) {
          setError(result.error ?? "Could not save profile.");
          return;
        }
        await refreshProfile();
        setInfo("Profile saved.");
      } finally {
        setBusy(false);
      }
    },
    [displayName, organization, saveProfile, refreshProfile],
  );

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">Your profile</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Name and organization are shown to admins when reviewing access.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4"
      >
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          Email
          <input
            type="email"
            readOnly
            value={session?.email ?? profile?.email ?? ""}
            className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/60 px-4 py-3 text-sm text-[var(--color-text-secondary)] cursor-not-allowed"
          />
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          Name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane Farmer"
            maxLength={120}
            className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-dim)]"
          />
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          Organization
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Farm, co-op, or university"
            maxLength={200}
            className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-dim)]"
          />
        </label>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Status:{" "}
          <span className="text-[var(--color-text-primary)] capitalize">{profile?.status}</span>
          {profile?.role === "admin" ? " · admin" : ""}
        </p>
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
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>

      <Link href="/prototype/" className="text-sm text-[var(--color-accent)] hover:underline">
        ← Back to Field lab
      </Link>
    </div>
  );
}
