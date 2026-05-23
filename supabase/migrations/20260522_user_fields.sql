-- User-saved field polygons for the Field lab.
-- Run once on existing Supabase projects.

create table if not exists public.user_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  crop text not null check (crop in ('corn', 'cotton', 'soybean', 'other')),
  geometry jsonb not null,
  acquisition_start_date date,
  acquisition_end_date date,
  area_m2 double precision,
  area_acres double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_fields_acquisition_window_check
    check (
      acquisition_start_date is null
      or acquisition_end_date is null
      or acquisition_start_date <= acquisition_end_date
    )
);

alter table public.user_fields
  add column if not exists acquisition_start_date date,
  add column if not exists acquisition_end_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_fields_acquisition_window_check'
  ) then
    alter table public.user_fields
      add constraint user_fields_acquisition_window_check
      check (
        acquisition_start_date is null
        or acquisition_end_date is null
        or acquisition_start_date <= acquisition_end_date
      );
  end if;
end;
$$;

create index if not exists user_fields_user_id_idx on public.user_fields (user_id);
create index if not exists user_fields_crop_idx on public.user_fields (crop);

create or replace function public.set_user_fields_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_fields_updated_at on public.user_fields;

create trigger user_fields_updated_at
before update on public.user_fields
for each row
execute function public.set_user_fields_updated_at ();

alter table public.user_fields enable row level security;

drop policy if exists "user_fields_select_own" on public.user_fields;
create policy "user_fields_select_own"
on public.user_fields
for select
to authenticated
using (auth.uid () = user_id);

drop policy if exists "user_fields_insert_own" on public.user_fields;
create policy "user_fields_insert_own"
on public.user_fields
for insert
to authenticated
with check (auth.uid () = user_id);

drop policy if exists "user_fields_update_own" on public.user_fields;
create policy "user_fields_update_own"
on public.user_fields
for update
to authenticated
using (auth.uid () = user_id)
with check (auth.uid () = user_id);

drop policy if exists "user_fields_delete_own" on public.user_fields;
create policy "user_fields_delete_own"
on public.user_fields
for delete
to authenticated
using (auth.uid () = user_id);
