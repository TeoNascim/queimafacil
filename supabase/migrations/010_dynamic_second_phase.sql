-- Cria antecipadamente os quatro grupos da segunda fase.
-- As vagas são exibidas dinamicamente pelo aplicativo até a classificação final.

create or replace function public.prepare_second_phase(p_tournament_id uuid)
returns setof public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_index integer;
begin
  select organization_id into v_org_id
  from public.tournaments
  where id = p_tournament_id;

  if v_org_id is null or not public.is_org_member(v_org_id) then
    raise exception 'Sem acesso a este torneio.';
  end if;

  for v_index in 1..4 loop
    insert into public.groups (tournament_id, name, sort_order, phase_number)
    values (p_tournament_id, '2º fase ' || v_index, 100 + v_index, 2)
    on conflict do nothing;
  end loop;

  return query
  select g.*
  from public.groups g
  where g.tournament_id = p_tournament_id
    and g.phase_number = 2
  order by g.sort_order;
end;
$$;

revoke all on function public.prepare_second_phase(uuid) from public;
grant execute on function public.prepare_second_phase(uuid) to authenticated;
