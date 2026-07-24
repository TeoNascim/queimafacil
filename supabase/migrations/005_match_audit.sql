create or replace function public.log_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
begin
  select organization_id into org_id
  from public.tournaments
  where id = new.tournament_id;

  insert into public.audit_log (
    organization_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) values (
    org_id,
    auth.uid(),
    case
      when old.status is distinct from new.status
        or old.home_score is distinct from new.home_score
        or old.away_score is distinct from new.away_score
      then 'placar_atualizado'
      else 'partida_atualizada'
    end,
    'match',
    new.id,
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists matches_audit_trigger on public.matches;
create trigger matches_audit_trigger
  after update on public.matches
  for each row execute procedure public.log_match_change();

create policy audit_staff_read on public.audit_log
  for select to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['admin','professor','arbitro']::public.app_role[]
    )
  );
