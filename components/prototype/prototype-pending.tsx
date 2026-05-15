"use client";

import Link from "next/link";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypePending({
  variant,
}: {
  variant: "pending" | "rejected";
}) {
  const { profile, signOut } = usePrototypeAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Field lab access
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
          {variant === "rejected" ? "Access not granted" : "Awaiting approval"}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {variant === "rejected" ? (
            <>
              Your account <strong className="text-[var(--color-text-primary)]">{profile?.email}</strong> was
              not approved for this prototype. Contact the WeedWatch team if you believe this is an error.
            </>
          ) : (
            <>
              Thanks for signing up as{" "}
              <strong className="text-[var(--color-text-primary)]">{profile?.email}</strong>. An admin must
              approve your account before you can use the map and mock acquisition tools. You can still
              complete your profile while you wait.
            </>
          )}
        </p>
        {variant === "pending" ? (
          <Link
            href="/prototype/profile"
            className="mt-4 block w-full text-center rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90"
          >
            Edit profile
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
