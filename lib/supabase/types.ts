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

export type UserFieldPrediction = {
  id: string;
  user_id: string;
  field_id: string;
  dataset_id: string;
  dataset_label: string;
  acquisition_date: string | null;
  predicted_at: string;
  accuracy_score: number | null;
  infested_acres: number | null;
  infested_pct: number | null;
  mean_confidence: number | null;
  pixel_size_meters: number | null;
  overlay: unknown | null;
  created_at: string;
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

export type UserFieldPredictionInput = {
  field_id: string;
  dataset_id: string;
  dataset_label: string;
  acquisition_date?: string | null;
  predicted_at: string;
  accuracy_score?: number | null;
  infested_acres?: number | null;
  infested_pct?: number | null;
  mean_confidence?: number | null;
  pixel_size_meters?: number | null;
  overlay: unknown;
};
