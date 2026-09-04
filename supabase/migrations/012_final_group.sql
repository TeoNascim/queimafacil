-- Grupo final dinâmico, preservando as fases anteriores.
alter table public.groups drop constraint if exists groups_phase_number_check;
alter table public.groups add constraint groups_phase_number_check check (phase_number in (1, 2, 3, 4));

create or replace function public.prepare_final(p_tournament_id uuid)
returns setof public.groups language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  select organization_id into v_org_id from public.tournaments where id = p_tournament_id;
  if v_org_id is null or not public.is_org_member(v_org_id) then raise exception 'Sem acesso a este torneio.'; end if;
  insert into public.groups (tournament_id, name, sort_order, phase_number)
  values (p_tournament_id, 'FINAL', 301, 4) on conflict do nothing;
  return query select g.* from public.groups g where g.tournament_id = p_tournament_id and g.phase_number = 4 order by g.sort_order;
end;
$$;

create or replace function public.generate_final(p_tournament_id uuid, p_assignments jsonb)
returns setof public.groups language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; v_group public.groups%rowtype; v_team_id uuid;
begin
  select organization_id into v_org_id from public.tournaments where id = p_tournament_id;
  if v_org_id is null or not public.has_org_role(v_org_id, array['admin','professor']::public.app_role[]) then raise exception 'Sem permissão para confirmar a fase final.'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) <> 1 or jsonb_array_length(p_assignments->0->'team_ids') <> 4 then raise exception 'A fase final precisa ter um grupo com quatro equipes.'; end if;
  if (select count(distinct value::uuid) from jsonb_array_elements_text(p_assignments->0->'team_ids')) <> 4 then raise exception 'A fase final precisa ter quatro equipes diferentes.'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_assignments->0->'team_ids') team(value) where not exists (select 1 from public.teams where id = team.value::uuid and tournament_id = p_tournament_id)) then raise exception 'Uma das equipes não pertence a este torneio.'; end if;
  select * into v_group from public.groups where tournament_id = p_tournament_id and name = 'FINAL' and phase_number = 4;
  if not found then insert into public.groups (tournament_id, name, sort_order, phase_number) values (p_tournament_id, 'FINAL', 301, 4) returning * into v_group; end if;
  delete from public.group_teams where group_id = v_group.id;
  for v_team_id in select value::uuid from jsonb_array_elements_text(p_assignments->0->'team_ids') loop
    insert into public.group_teams (group_id, team_id, seed_label) values (v_group.id, v_team_id, 'Classificado automaticamente');
  end loop;
  return next v_group;
end;
$$;

revoke all on function public.prepare_final(uuid) from public;
grant execute on function public.prepare_final(uuid) to authenticated;
revoke all on function public.generate_final(uuid, jsonb) from public;
grant execute on function public.generate_final(uuid, jsonb) to authenticated;
