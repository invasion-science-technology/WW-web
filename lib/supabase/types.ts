export type ProfileStatus = "pending" | "approved" | "rejected";
export type ProfileRole = "user" | "admin";

export type Profile = {
  id: string;
  email: string;
  status: ProfileStatus;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
};
