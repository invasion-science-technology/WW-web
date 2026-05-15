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
