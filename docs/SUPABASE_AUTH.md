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

## 5. Notify admins when approval is pending

The static app cannot safely send admin emails from the browser. Use the Supabase Edge Function in
[`supabase/functions/notify-pending-approval`](../supabase/functions/notify-pending-approval) and trigger it from a
Supabase Database Webhook whenever a profile is inserted with `status = 'pending'`.

This function uses [Resend](https://resend.com/) to send email.

### Deploy the function

Install/login to the Supabase CLI, then from the repo root:

```bash
supabase functions deploy notify-pending-approval --no-verify-jwt
```

Set function secrets:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set APPROVAL_NOTIFY_TO=you@example.com
supabase secrets set APPROVAL_NOTIFY_FROM="WeedWatch <alerts@your-domain.com>"
supabase secrets set APPROVAL_ADMIN_URL="https://your-host/prototype/admin/"
supabase secrets set WEBHOOK_SECRET="replace-with-a-long-random-string"
```

Notes:

- `APPROVAL_NOTIFY_TO` can be a comma-separated list.
- `APPROVAL_NOTIFY_FROM` must be a sender verified in Resend. Resend's sandbox sender only works for limited testing.
- `WEBHOOK_SECRET` is required because the function is deployed with `--no-verify-jwt` so Supabase webhooks can call it.

### Create the Database Webhook

In Supabase Dashboard:

1. **Database → Webhooks → Create a new hook**
2. Table: `public.profiles`
3. Events: `Insert`
4. Type: `HTTP Request`
5. Method: `POST`
6. URL:
   `https://<project-ref>.functions.supabase.co/notify-pending-approval`
7. Headers:
   - `x-webhook-secret: <same WEBHOOK_SECRET value>`
   - `content-type: application/json`
8. Optional condition/filter: `status = 'pending'`

The function also checks the payload and skips anything that is not an inserted pending profile.

## 6. Approve sign-ups

Open **Field lab → Admin** (`/prototype/admin/`) while signed in as an admin. Pending users can be **Approved** or **Rejected**.

## 7. Profile (name & organization)

Pending and approved users can open **Field lab → Profile** (`/prototype/profile/`) to set display name and organization.

On an **existing** Supabase project, run [`supabase/migrations/20250515_epic_0_1_profile.sql`](../supabase/migrations/20250515_epic_0_1_profile.sql) in the SQL Editor.

## 8. Saved fields

Approved users can draw field polygons, name them, assign a crop (`corn`, `cotton`, `soybean`, or `other`), set a satellite acquisition time window, and save them permanently to their account.

On an **existing** Supabase project, run [`supabase/migrations/20260522_user_fields.sql`](../supabase/migrations/20260522_user_fields.sql) in the SQL Editor. New projects that run [`supabase/schema.sql`](../supabase/schema.sql) already include the `user_fields` table and RLS policies.

## 9. Email verification

1. **Authentication → Providers → Email** — enable **Confirm email** if you require verification before sign-in.
2. After sign-up, users see **Check your inbox** with **Resend verification email**.
3. Add your app URLs under **Redirect URLs** (same as Site URL / `/**`).

## 10. Password reset

1. **Authentication → URL configuration** — ensure redirect URLs include your reset page, e.g.  
   `http://54.177.153.205/prototype/reset-password/**`  
   (and the same for GitHub Pages with `/WW-web` prefix if used:  
   `https://<org>.github.io/WW-web/prototype/reset-password/**`)
2. Users click **Forgot password?** on sign-in, enter email, then open the link in the email.
3. Set a new password on `/prototype/reset-password/`, then sign in again.

Optional: **Authentication → Email Templates** → customize the reset message.

## Demo mode (no Supabase)

Demo mode is local opt-in only:

```env
NEXT_PUBLIC_PROTO_DEMO_MODE=1
NEXT_PUBLIC_PROTO_EMAIL=demo@weedwatch.local
NEXT_PUBLIC_PROTO_PASSWORD=weedwatch
```

Do not set `NEXT_PUBLIC_PROTO_DEMO_MODE` on EC2 or production builds.
