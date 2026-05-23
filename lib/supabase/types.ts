export type ProfileStatus = "pending" | "approved" | "rejected";
export type ProfileRole = "user" | "admin";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  organization: string | null;
  status: ProfileStatus;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = {
  display_name?: string | null;
  organization?: string | null;
};

export type CropCategory = "corn" | "cotton" | "soybean" | "other";

export type UserField = {
  id: string;
  user_id: string;
  name: string;
  crop: CropCategory;
  geometry: unknown;
  acquisition_start_date: string | null;
  acquisition_end_date: string | null;
  area_m2: number | null;
  area_acres: number | null;
  created_at: string;
  updated_at: string;
};

export type UserFieldInput = {
  name: string;
  crop: CropCategory;
  geometry: unknown;
  acquisition_start_date?: string | null;
  acquisition_end_date?: string | null;
  area_m2?: number | null;
  area_acres?: number | null;
};
