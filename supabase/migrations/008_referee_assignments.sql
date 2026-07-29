create table if not exists public.match_referees (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  referee_name text not null,
  school_name text not null,
  assignment_role text not null default 'Árbitro',
  created_at timestamptz not null default now(),
  unique (match_id, referee_name)
);

create index if not exists match_referees_match_idx
  on public.match_referees(match_id);

alter table public.match_referees enable row level security;

drop policy if exists match_referees_member_read on public.match_referees;
create policy match_referees_member_read on public.match_referees
  for select to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and public.is_org_member(t.organization_id)
    )
  );

drop policy if exists match_referees_admin_manage on public.match_referees;
create policy match_referees_admin_manage on public.match_referees
  for all to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and public.has_org_role(t.organization_id, array['admin']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and public.has_org_role(t.organization_id, array['admin']::public.app_role[])
    )
  );
