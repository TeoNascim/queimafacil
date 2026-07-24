create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'professor', 'treinador', 'arbitro', 'visualizador');
create type public.tournament_status as enum ('rascunho', 'inscricoes', 'em_andamento', 'encerrado');
create type public.match_status as enum ('agendada', 'em_andamento', 'encerrada', 'cancelada');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'visualizador',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,
  venue text,
  starts_on date,
  ends_on date,
  status public.tournament_status not null default 'rascunho',
  points_win integer not null default 3,
  points_loss integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (tournament_id, name)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  name text not null,
  short_name text,
  color text,
  coach_name text,
  unique (tournament_id, name)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  full_name text not null,
  shirt_number integer,
  birth_date date,
  category text,
  active boolean not null default true,
  unique (team_id, shirt_number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  referee_id uuid references public.profiles(id),
  phase text not null default 'Fase de grupos',
  round_number integer,
  scheduled_at timestamptz,
  court text,
  home_score integer,
  away_score integer,
  home_burned integer not null default 0,
  away_burned integer not null default 0,
  status public.match_status not null default 'agendada',
  notes text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (home_score is null or home_score >= 0),
  check (away_score is null or away_score >= 0)
  ,check (home_burned >= 0)
  ,check (away_burned >= 0)
);

create table public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number integer not null,
  home_points integer not null default 0,
  away_points integer not null default 0,
  unique (match_id, set_number)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_idx on public.memberships(user_id);
create index tournaments_org_idx on public.tournaments(organization_id);
create index teams_tournament_idx on public.teams(tournament_id);
create index players_team_idx on public.players(team_id);
create index matches_tournament_idx on public.matches(tournament_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org_id and user_id = auth.uid() and active
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed public.app_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org_id and user_id = auth.uid()
      and role = any(allowed) and active
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.tournaments enable row level security;
alter table public.groups enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_sets enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_member_read on public.organizations
  for select to authenticated using (public.is_org_member(id));

create policy memberships_member_read on public.memberships
  for select to authenticated using (public.is_org_member(organization_id));

create policy memberships_admin_manage on public.memberships
  for all to authenticated
  using (public.has_org_role(organization_id, array['admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['admin']::public.app_role[]));

create policy tournaments_read on public.tournaments
  for select using (
    public.is_org_member(organization_id)
    or status in ('em_andamento', 'encerrado')
  );

create policy tournaments_manage on public.tournaments
  for all to authenticated
  using (public.has_org_role(organization_id, array['admin','professor']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['admin','professor']::public.app_role[]));

create policy groups_read on public.groups for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id
    and (public.is_org_member(t.organization_id) or t.status in ('em_andamento','encerrado')))
);
create policy groups_manage on public.groups for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id
    and public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id
    and public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])));

create policy teams_read on public.teams for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id
    and (public.is_org_member(t.organization_id) or t.status in ('em_andamento','encerrado')))
);
create policy teams_manage on public.teams for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id
    and public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id
    and public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])));

create policy players_member_read on public.players for select to authenticated using (
  exists (select 1 from public.teams te join public.tournaments t on t.id = te.tournament_id
    where te.id = team_id and public.is_org_member(t.organization_id))
);
create policy players_manage on public.players for all to authenticated
  using (exists (select 1 from public.teams te join public.tournaments t on t.id = te.tournament_id
    where te.id = team_id and public.has_org_role(t.organization_id, array['admin','professor','treinador']::public.app_role[])))
  with check (exists (select 1 from public.teams te join public.tournaments t on t.id = te.tournament_id
    where te.id = team_id and public.has_org_role(t.organization_id, array['admin','professor','treinador']::public.app_role[])));

create policy matches_read on public.matches for select using (
  exists (select 1 from public.tournaments t where t.id = tournament_id
    and (public.is_org_member(t.organization_id) or t.status in ('em_andamento','encerrado')))
);
create policy matches_staff_manage on public.matches for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and (
    public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])
    or (public.has_org_role(t.organization_id, array['arbitro']::public.app_role[]) and referee_id = auth.uid())
  )))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and (
    public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])
    or (public.has_org_role(t.organization_id, array['arbitro']::public.app_role[]) and referee_id = auth.uid())
  )));

create policy sets_read on public.match_sets for select using (
  exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = match_id and (public.is_org_member(t.organization_id) or t.status in ('em_andamento','encerrado')))
);
create policy sets_staff_manage on public.match_sets for all to authenticated
  using (exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = match_id and (
      public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])
      or (public.has_org_role(t.organization_id, array['arbitro']::public.app_role[]) and m.referee_id = auth.uid())
    )))
  with check (exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = match_id and (
      public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])
      or (public.has_org_role(t.organization_id, array['arbitro']::public.app_role[]) and m.referee_id = auth.uid())
    )));

create policy audit_admin_read on public.audit_log for select to authenticated
  using (public.has_org_role(organization_id, array['admin']::public.app_role[]));
