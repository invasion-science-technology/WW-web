import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Profile, ProfileStatus, ProfileUpdate } from "@/lib/supabase/types";

export type { Profile, ProfileStatus };

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (typeof window === "undefined") return null;

  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }

  return browserClient;
}

export type FetchProfileResult = {
  profile: Profile | null;
  error?: string;
};

export async function fetchProfile(
  client: SupabaseClient,
  userId: string,
): Promise<FetchProfileResult> {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, display_name, organization, status, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profiles]", error.message);
    return { profile: null, error: error.message };
  }

  if (!data) {
    return {
      profile: null,
      error: "Account profile not found. Contact support or try signing in again.",
    };
  }

  return { profile: data as Profile };
}

export async function updateProfileFields(
  client: SupabaseClient,
  userId: string,
  fields: ProfileUpdate,
): Promise<{ profile: Profile | null; error?: string }> {
  const payload: ProfileUpdate = {};
  if (fields.display_name !== undefined) {
    payload.display_name = fields.display_name?.trim() || null;
  }
  if (fields.organization !== undefined) {
    payload.organization = fields.organization?.trim() || null;
  }

  const { data, error } = await client
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("id, email, display_name, organization, status, role, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[profiles update]", error.message);
    return { profile: null, error: error.message };
  }

  return { profile: data as Profile | null };
}
