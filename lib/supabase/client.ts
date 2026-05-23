import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  Profile,
  ProfileStatus,
  UserField,
  UserFieldInput,
  ProfileUpdate,
} from "@/lib/supabase/types";

export type { Profile, ProfileStatus };

const USER_FIELD_COLUMNS =
  "id, user_id, name, crop, geometry, acquisition_start_date, acquisition_end_date, area_m2, area_acres, created_at, updated_at";

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

function cleanFieldInput(input: UserFieldInput) {
  return {
    name: input.name.trim(),
    crop: input.crop,
    geometry: input.geometry,
    acquisition_start_date: input.acquisition_start_date ?? null,
    acquisition_end_date: input.acquisition_end_date ?? null,
    area_m2: input.area_m2 ?? null,
    area_acres: input.area_acres ?? null,
  };
}

export async function fetchUserFields(
  client: SupabaseClient,
  userId: string,
): Promise<{ fields: UserField[]; error?: string }> {
  const { data, error } = await client
    .from("user_fields")
    .select(USER_FIELD_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[user fields]", error.message);
    return { fields: [], error: error.message };
  }

  return { fields: (data ?? []) as UserField[] };
}

export async function createUserField(
  client: SupabaseClient,
  userId: string,
  input: UserFieldInput,
): Promise<{ field: UserField | null; error?: string }> {
  const payload = {
    user_id: userId,
    ...cleanFieldInput(input),
  };

  const { data, error } = await client
    .from("user_fields")
    .insert(payload)
    .select(USER_FIELD_COLUMNS)
    .single();

  if (error) {
    console.error("[user fields create]", error.message);
    return { field: null, error: error.message };
  }

  return { field: data as UserField };
}

export async function updateUserField(
  client: SupabaseClient,
  userId: string,
  fieldId: string,
  input: UserFieldInput,
): Promise<{ field: UserField | null; error?: string }> {
  const { data, error } = await client
    .from("user_fields")
    .update(cleanFieldInput(input))
    .eq("id", fieldId)
    .eq("user_id", userId)
    .select(USER_FIELD_COLUMNS)
    .single();

  if (error) {
    console.error("[user fields update]", error.message);
    return { field: null, error: error.message };
  }

  return { field: data as UserField };
}

export async function deleteUserField(
  client: SupabaseClient,
  userId: string,
  fieldId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from("user_fields")
    .delete()
    .eq("id", fieldId)
    .eq("user_id", userId);

  if (error) {
    console.error("[user fields delete]", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
