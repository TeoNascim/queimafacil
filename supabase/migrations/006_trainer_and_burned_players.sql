alter type public.app_role add value if not exists 'treinador';

alter table public.matches
  add column if not exists home_burned integer not null default 0,
  add column if not exists away_burned integer not null default 0;

alter table public.matches
  drop constraint if exists matches_home_burned_check,
  drop constraint if exists matches_away_burned_check;

alter table public.matches
  add constraint matches_home_burned_check check (home_burned >= 0),
  add constraint matches_away_burned_check check (away_burned >= 0);

drop policy if exists players_manage on public.players;
create policy players_manage on public.players
  for all to authenticated
  using (
    exists (
      select 1
      from public.teams te
      join public.tournaments t on t.id = te.tournament_id
      join public.memberships m on m.organization_id = t.organization_id
      where te.id = team_id
        and m.user_id = auth.uid()
        and m.active
        and m.role::text in ('admin','professor','treinador')
    )
  )
  with check (
    exists (
      select 1
      from public.teams te
      join public.tournaments t on t.id = te.tournament_id
      join public.memberships m on m.organization_id = t.organization_id
      where te.id = team_id
        and m.user_id = auth.uid()
        and m.active
        and m.role::text in ('admin','professor','treinador')
    )
  );
