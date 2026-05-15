"use client";

import PrototypeLogin from "@/components/prototype/prototype-login";
import PrototypePending from "@/components/prototype/prototype-pending";
import { usePrototypeAuth } from "@/components/prototype/prototype-auth";

export default function PrototypeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { gateState } = usePrototypeAuth();

  if (gateState === "loading") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
      </div>
    );
  }

  if (gateState === "signed_out") return <PrototypeLogin />;
  if (gateState === "pending") return <PrototypePending variant="pending" />;
  if (gateState === "rejected") return <PrototypePending variant="rejected" />;

  return <>{children}</>;
}
