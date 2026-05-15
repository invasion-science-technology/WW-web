-- WeedWatch Field lab — run in Supabase SQL Editor (Dashboard → SQL → New query)
-- Enables sign-up with manual admin approval (no-pay prototype stage).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  organization text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  role text not null default 'user'
    check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, role)
  values (new.id, coalesce(new.email, ''), 'pending', 'user');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user ();

create or replace function public.set_profiles_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;

create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at ();

alter table public.profiles enable row level security;

-- SECURITY DEFINER avoids RLS recursion when admin policies read profiles.
create or replace function public.is_admin ()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid ()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin () from public;
grant execute on function public.is_admin () to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid () = id);

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.is_admin ());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid () = id)
with check (auth.uid () = id);

create or replace function public.protect_profile_privileged_columns ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin () then
    if new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.email is distinct from old.email
      or new.id is distinct from old.id then
      raise exception 'Only admins may change account status or role';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged on public.profiles;

create trigger profiles_protect_privileged
before update on public.profiles
for each row
execute function public.protect_profile_privileged_columns ();

-- Promote your account after first sign-up (replace email):
-- update public.profiles set role = 'admin', status = 'approved' where email = 'you@example.com';
