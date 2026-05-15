"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypeShell({ children }: { children: ReactNode }) {
  const { session, gateState, isAdmin, signOut, mode } = usePrototypeAuth();
  const showNav = gateState === "approved";

  return (
    <div className="relative z-10 min-h-screen flex flex-col bg-[var(--color-background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[#080c08]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="text-sm font-semibold text-[var(--color-accent)] truncate"
            >
              WeedWatch AI
            </Link>
            <span className="text-[var(--color-border)] hidden sm:inline">/</span>
            <span className="text-sm text-[var(--color-text-secondary)] truncate hidden sm:inline">
              Field lab (prototype)
            </span>
          </div>
          <nav className="flex items-center gap-2 shrink-0">
            {showNav && session ? (
              <>
                <Link
                  href="/prototype/profile"
                  className="text-xs sm:text-sm px-3 py-2 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  Profile
                </Link>
                {isAdmin ? (
                  <Link
                    href="/prototype/admin"
                    className="text-xs sm:text-sm px-3 py-2 rounded-full border border-[var(--color-border)] text-[var(--color-accent)] hover:border-[var(--color-accent-dim)] transition-colors"
                  >
                    Admin
                  </Link>
                ) : null}
                <span className="text-xs text-[var(--color-text-secondary)] truncate max-w-[100px] sm:max-w-[160px] hidden sm:inline">
                  {session.email}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="text-xs sm:text-sm px-3 py-2 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-red-400/50 hover:text-red-300 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : gateState === "signed_out" ? (
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                {mode === "supabase" ? "Sign in required" : "Demo"}
              </span>
            ) : null}
            <Link
              href="/"
              className="text-xs sm:text-sm px-3 py-2 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Marketing site
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
