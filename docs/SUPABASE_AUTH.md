# Field lab auth (Supabase)

Sign-up + **admin approval** for the no-pay prototype. Works with **static GitHub Pages** (browser-only Supabase client).

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project.
2. **Authentication → Providers → Email**: enable Email, optionally disable “Confirm email” for faster internal testing (you still approve via `profiles.status`).
3. **Project Settings → API**: copy **Project URL** and **anon public** key.

## 2. Run the schema

In **SQL Editor**, paste and run [`supabase/schema.sql`](../supabase/schema.sql).

If you see **`infinite recursion detected in policy for relation "profiles"`** in the browser console, run [`supabase/fix-rls-recursion.sql`](../supabase/fix-rls-recursion.sql) in the SQL Editor (one-time fix).

## 3. Create your admin user

1. Sign up once in the app (or create user in **Authentication → Users**).
2. In SQL Editor:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where email = 'your-email@example.com';
```

## 4. Configure the app

Copy to `.env.local` (and **GitHub Actions secrets** for Pages deploy):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Remove or leave unset `NEXT_PUBLIC_PROTO_EMAIL` / `NEXT_PUBLIC_PROTO_PASSWORD` — when Supabase env vars are set, **demo login is disabled**.

## 5. Approve sign-ups

Open **Field lab → Admin** (`/prototype/admin/`) while signed in as an admin. Pending users can be **Approved** or **Rejected**.

## 6. Profile (name & organization)

Approved users can open **Field lab → Profile** (`/prototype/profile/`) to set display name and organization.

On an **existing** Supabase project, run [`supabase/migrations/20250515_epic_0_1_profile.sql`](../supabase/migrations/20250515_epic_0_1_profile.sql) in the SQL Editor.

## 7. Email verification

1. **Authentication → Providers → Email** — enable **Confirm email** if you require verification before sign-in.
2. After sign-up, users see **Check your inbox** with **Resend verification email**.
3. Add your app URLs under **Redirect URLs** (same as Site URL / `/**`).

## 8. Password reset

1. **Authentication → URL configuration** — ensure redirect URLs include your reset page, e.g.  
   `http://54.177.153.205/prototype/reset-password/**`  
   (and the same for GitHub Pages with `/WW-web` prefix if used:  
   `https://<org>.github.io/WW-web/prototype/reset-password/**`)
2. Users click **Forgot password?** on sign-in, enter email, then open the link in the email.
3. Set a new password on `/prototype/reset-password/`, then sign in again.

Optional: **Authentication → Email Templates** → customize the reset message.

## Demo mode (no Supabase)

If Supabase env vars are missing, the app falls back to a single shared demo account (`NEXT_PUBLIC_PROTO_EMAIL` / `NEXT_PUBLIC_PROTO_PASSWORD` in `.env.example`).
