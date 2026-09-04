-- Semifinal dinâmica, preservando as fases anteriores.
alter table public.groups drop constraint if exists groups_phase_number_check;
alter table public.groups add constraint groups_phase_number_check check (phase_number in (1, 2, 3));

create or replace function public.prepare_semifinal(p_tournament_id uuid)
returns setof public.groups language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; v_index integer;
begin
  select organization_id into v_org_id from public.tournaments where id = p_tournament_id;
  if v_org_id is null or not public.is_org_member(v_org_id) then raise exception 'Sem acesso a este torneio.'; end if;
  for v_index in 1..2 loop
    insert into public.groups (tournament_id, name, sort_order, phase_number)
    values (p_tournament_id, 'SEMIFINAL ' || v_index, 200 + v_index, 3) on conflict do nothing;
  end loop;
  return query select g.* from public.groups g where g.tournament_id = p_tournament_id and g.phase_number = 3 order by g.sort_order;
end;
$$;

create or replace function public.generate_semifinal(p_tournament_id uuid, p_assignments jsonb)
returns setof public.groups language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; v_group public.groups%rowtype; v_item jsonb; v_team_id uuid; v_index integer := 0;
begin
  select organization_id into v_org_id from public.tournaments where id = p_tournament_id;
  if v_org_id is null or not public.has_org_role(v_org_id, array['admin','professor']::public.app_role[]) then raise exception 'Sem permissão para confirmar a semifinal.'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) <> 2 then raise exception 'A semifinal precisa ter exatamente dois grupos.'; end if;
  if (select count(distinct team.value::uuid) from jsonb_array_elements(p_assignments) assignment(value), lateral jsonb_array_elements_text(assignment.value->'team_ids') team(value)) <> 8 then raise exception 'A semifinal precisa ter oito equipes diferentes.'; end if;
  if exists (select 1 from jsonb_array_elements(p_assignments) assignment(value), lateral jsonb_array_elements_text(assignment.value->'team_ids') team(value) where not exists (select 1 from public.teams where id = team.value::uuid and tournament_id = p_tournament_id)) then raise exception 'Uma das equipes não pertence a este torneio.'; end if;
  delete from public.group_teams gt using public.groups g where gt.group_id = g.id and g.tournament_id = p_tournament_id and g.phase_number = 3;
  for v_item in select value from jsonb_array_elements(p_assignments) loop
    v_index := v_index + 1;
    if jsonb_array_length(v_item->'team_ids') <> 4 then raise exception 'Cada grupo semifinal precisa ter quatro equipes.'; end if;
    select * into v_group from public.groups where tournament_id = p_tournament_id and name = 'SEMIFINAL ' || v_index and phase_number = 3;
    if not found then insert into public.groups (tournament_id, name, sort_order, phase_number) values (p_tournament_id, 'SEMIFINAL ' || v_index, 200 + v_index, 3) returning * into v_group; end if;
    for v_team_id in select value::uuid from jsonb_array_elements_text(v_item->'team_ids') loop
      insert into public.group_teams (group_id, team_id, seed_label) values (v_group.id, v_team_id, 'Classificado automaticamente');
    end loop;
    return next v_group;
  end loop;
end;
$$;

revoke all on function public.prepare_semifinal(uuid) from public;
grant execute on function public.prepare_semifinal(uuid) to authenticated;
revoke all on function public.generate_semifinal(uuid, jsonb) from public;
grant execute on function public.generate_semifinal(uuid, jsonb) to authenticated;
