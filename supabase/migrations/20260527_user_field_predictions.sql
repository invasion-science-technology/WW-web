-- Prediction history for saved Field lab polygons.
-- Run once on existing Supabase projects after 20260522_user_fields.sql.

create table if not exists public.user_field_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  field_id uuid not null references public.user_fields (id) on delete cascade,
  dataset_id text not null,
  dataset_label text not null,
  acquisition_date date,
  predicted_at timestamptz not null default now(),
  accuracy_score double precision,
  infested_acres double precision,
  infested_pct double precision,
  mean_confidence double precision,
  pixel_size_meters double precision,
  overlay jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists user_field_predictions_user_field_idx
on public.user_field_predictions (user_id, field_id, predicted_at desc);

alter table public.user_field_predictions enable row level security;

drop policy if exists "user_field_predictions_select_own" on public.user_field_predictions;
create policy "user_field_predictions_select_own"
on public.user_field_predictions
for select
to authenticated
using (auth.uid () = user_id);

drop policy if exists "user_field_predictions_insert_own" on public.user_field_predictions;
create policy "user_field_predictions_insert_own"
on public.user_field_predictions
for insert
to authenticated
with check (
  auth.uid () = user_id
  and exists (
    select 1
    from public.user_fields
    where user_fields.id = field_id
      and user_fields.user_id = auth.uid ()
  )
);

drop policy if exists "user_field_predictions_delete_own" on public.user_field_predictions;
create policy "user_field_predictions_delete_own"
on public.user_field_predictions
for delete
to authenticated
using (auth.uid () = user_id);
