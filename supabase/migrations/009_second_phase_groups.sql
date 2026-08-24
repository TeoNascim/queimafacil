-- Grupos por fase e classificação automática para a segunda fase.

alter table public.groups
  add column if not exists phase_number smallint not null default 1
  check (phase_number in (1, 2));

create table if not exists public.group_teams (
  group_id uuid not null references public.groups(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  seed_label text,
  created_at timestamptz not null default now(),
  primary key (group_id, team_id)
);

create index if not exists group_teams_team_idx on public.group_teams(team_id);

insert into public.group_teams (group_id, team_id, seed_label)
select group_id, id, 'Primeira fase'
from public.teams
where group_id is not null
on conflict (group_id, team_id) do nothing;

alter table public.group_teams enable row level security;

drop policy if exists group_teams_read on public.group_teams;
create policy group_teams_read on public.group_teams for select using (
  exists (
    select 1 from public.groups g
    join public.tournaments t on t.id = g.tournament_id
    where g.id = group_id
      and (public.is_org_member(t.organization_id) or t.status in ('em_andamento','encerrado'))
  )
);

drop policy if exists group_teams_manage on public.group_teams;
create policy group_teams_manage on public.group_teams for all to authenticated
  using (
    exists (
      select 1 from public.groups g
      join public.tournaments t on t.id = g.tournament_id
      where g.id = group_id
        and public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      join public.tournaments t on t.id = g.tournament_id
      where g.id = group_id
        and public.has_org_role(t.organization_id, array['admin','professor']::public.app_role[])
    )
  );

create or replace function public.generate_second_phase(
  p_tournament_id uuid,
  p_assignments jsonb
)
returns setof public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_group public.groups%rowtype;
  v_item jsonb;
  v_team_id uuid;
  v_index integer := 0;
begin
  select organization_id into v_org_id
  from public.tournaments
  where id = p_tournament_id;

  if v_org_id is null or not public.has_org_role(v_org_id, array['admin','professor']::public.app_role[]) then
    raise exception 'Sem permissão para gerar a segunda fase.';
  end if;

  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) <> 4 then
    raise exception 'A segunda fase precisa ter exatamente quatro grupos.';
  end if;

  if (
    select count(distinct team.value::uuid)
    from jsonb_array_elements(p_assignments) as assignment(value),
         lateral jsonb_array_elements_text(assignment.value->'team_ids') as team(value)
  ) <> 16 then
    raise exception 'A segunda fase precisa ter 16 equipes diferentes.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as assignment(value),
         lateral jsonb_array_elements_text(assignment.value->'team_ids') as team(value)
    where not exists (
      select 1 from public.teams
      where id = team.value::uuid and tournament_id = p_tournament_id
    )
  ) then
    raise exception 'Uma das equipes não pertence a este torneio.';
  end if;

  delete from public.group_teams gt
  using public.groups g
  where gt.group_id = g.id
    and g.tournament_id = p_tournament_id
    and g.phase_number = 2;

  for v_item in select value from jsonb_array_elements(p_assignments)
  loop
    v_index := v_index + 1;
    if jsonb_array_length(v_item->'team_ids') <> 4 then
      raise exception 'Cada grupo da segunda fase precisa ter quatro equipes.';
    end if;

    select * into v_group
    from public.groups
    where tournament_id = p_tournament_id
      and name = '2º fase ' || v_index
      and phase_number = 2;

    if not found then
      insert into public.groups (tournament_id, name, sort_order, phase_number)
      values (p_tournament_id, '2º fase ' || v_index, 100 + v_index, 2)
      returning * into v_group;
    else
      update public.groups
      set sort_order = 100 + v_index
      where id = v_group.id
      returning * into v_group;
    end if;

    for v_team_id in
      select value::uuid from jsonb_array_elements_text(v_item->'team_ids')
    loop
      insert into public.group_teams (group_id, team_id, seed_label)
      values (v_group.id, v_team_id, 'Classificado automaticamente');
    end loop;

    return next v_group;
  end loop;
end;
$$;

revoke all on function public.generate_second_phase(uuid, jsonb) from public;
grant execute on function public.generate_second_phase(uuid, jsonb) to authenticated;
