import { isSupabaseConfigured } from "@/lib/supabase/client";

/** Explicit opt-in when Supabase env is missing (local dev only). */
export function isDemoModeEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_PROTO_DEMO_MODE?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export type PrototypeAuthMode = "supabase" | "demo" | "unconfigured";

export function resolvePrototypeAuthMode(): PrototypeAuthMode {
  if (isSupabaseConfigured()) return "supabase";
  if (isDemoModeEnabled()) return "demo";
  return "unconfigured";
}
