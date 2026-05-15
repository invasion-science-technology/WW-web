import type { Session } from "@supabase/supabase-js";

export function isEmailConfirmed(session: Session | null): boolean {
  if (!session?.user) return false;
  return Boolean(session.user.email_confirmed_at);
}

export function isUnconfirmedEmailError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("email not confirmed") ||
    lower.includes("email not verified") ||
    lower.includes("confirm your email")
  );
}
