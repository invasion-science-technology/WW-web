"use client";

import { usePathname } from "next/navigation";

import PrototypeEmailVerify from "@/components/prototype/prototype-email-verify";
import PrototypeLogin from "@/components/prototype/prototype-login";
import PrototypePending from "@/components/prototype/prototype-pending";
import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { gateState, session, supabaseSession } = usePrototypeAuth();

  if (pathname?.startsWith("/prototype/reset-password")) {
    return <>{children}</>;
  }

  if (gateState === "loading") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
      </div>
    );
  }

  if (gateState === "signed_out") return <PrototypeLogin />;
  if (gateState === "email_unverified") {
    const email = supabaseSession?.user?.email ?? session?.email ?? "";
    return <PrototypeEmailVerify email={email} />;
  }
  if (gateState === "pending") return <PrototypePending variant="pending" />;
  if (gateState === "rejected") return <PrototypePending variant="rejected" />;

  return <>{children}</>;
}
