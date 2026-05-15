"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Legacy path: `/proto` → `/prototype` */
export default function ProtoRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/prototype");
  }, [router]);
  return (
    <p className="p-8 text-sm text-[var(--color-text-secondary)]">
      Redirecting to Field lab…
    </p>
  );
}
