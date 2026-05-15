-- Fix: "infinite recursion detected in policy for relation profiles"
-- Run this in Supabase SQL Editor if you already applied schema.sql.

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
