-- Etapa 6 GPS: persistencia del trazado confirmado.
-- Aditiva: no modifica activities ni user_challenges.

create table if not exists public.gps_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  session_id text not null,
  points jsonb not null,
  point_count integer not null,
  created_at timestamptz not null default now(),
  constraint gps_routes_session_id_len check (char_length(session_id) between 8 and 128),
  constraint gps_routes_points_array check (jsonb_typeof(points) = 'array'),
  constraint gps_routes_point_count_nonnegative check (point_count >= 0),
  constraint gps_routes_user_session_unique unique (user_id, session_id),
  constraint gps_routes_activity_unique unique (activity_id)
);

create index if not exists gps_routes_user_created_idx
  on public.gps_routes (user_id, created_at desc);

alter table public.gps_routes enable row level security;

-- El backend escribe con service role. El usuario autenticado solo puede leer sus propios recorridos.
drop policy if exists gps_routes_select_own on public.gps_routes;
create policy gps_routes_select_own
  on public.gps_routes
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.gps_routes from anon, authenticated;
grant select on public.gps_routes to authenticated;
