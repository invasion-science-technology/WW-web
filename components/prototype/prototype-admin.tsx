"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile, ProfileStatus } from "@/lib/supabase/types";

export default function PrototypeAdmin() {
  const { isAdmin, refreshProfile } = usePrototypeAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: qError } = await client
      .from("profiles")
      .select("id, email, status, role, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (qError) {
      setError(qError.message);
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as Profile[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadProfiles();
    else setLoading(false);
  }, [isAdmin, loadProfiles]);

  const setStatus = useCallback(
    async (id: string, status: ProfileStatus) => {
      const client = getSupabaseClient();
      if (!client) return;

      setBusyId(id);
      setError(null);

      const { error: uError } = await client
        .from("profiles")
        .update({ status })
        .eq("id", id);

      setBusyId(null);

      if (uError) {
        setError(uError.message);
        return;
      }

      await loadProfiles();
      await refreshProfile();
    },
    [loadProfiles, refreshProfile],
  );

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Admin</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          You need an admin account to manage sign-ups. Promote your user in Supabase — see{" "}
          <code className="text-[var(--color-accent)] text-xs">docs/SUPABASE_AUTH.md</code>.
        </p>
        <Link
          href="/prototype"
          className="mt-4 inline-block text-sm text-[var(--color-accent)] hover:underline"
        >
          ← Back to Field lab
        </Link>
      </div>
    );
  }

  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Prototype admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
          User approvals
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-2xl">
          Approve or reject sign-ups for the no-pay Field lab. Approved users can access the map and mock
          pipeline.
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Loading users…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-medium bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              Pending ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--color-text-secondary)]">No pending sign-ups.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {pending.map((p) => (
                  <li
                    key={p.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">{p.email}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Requested {new Date(p.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void setStatus(p.id, "approved")}
                        className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#052e16] disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void setStatus(p.id, "rejected")}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-medium bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              All users ({profiles.length})
            </h2>
            <ul className="divide-y divide-[var(--color-border)] max-h-[420px] overflow-y-auto">
              {others.map((p) => (
                <li
                  key={p.id}
                  className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="text-[var(--color-text-primary)]">{p.email}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {p.role === "admin" ? "admin · " : ""}
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Link href="/prototype" className="text-sm text-[var(--color-accent)] hover:underline">
        ← Back to Field lab
      </Link>
    </div>
  );
}
