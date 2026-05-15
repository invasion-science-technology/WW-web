-- Epic 0.1 completion: profile fields + self-service update (run once on existing projects)

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists organization text;

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

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid () = id)
with check (auth.uid () = id);
