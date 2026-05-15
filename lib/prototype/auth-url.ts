/** Origin + optional Next basePath for Supabase email redirect URLs. */
export function getAppOrigin(): string {
  if (typeof window === "undefined") return "";
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  return `${window.location.origin}${base}`;
}

export function getPasswordResetRedirectUrl(): string {
  return `${getAppOrigin()}/prototype/reset-password/`;
}
