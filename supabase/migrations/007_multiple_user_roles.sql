alter table public.memberships
  add column if not exists roles text[] not null default '{}';

update public.memberships
set roles = array[role::text]
where cardinality(roles) = 0;

alter table public.memberships
  drop constraint if exists memberships_roles_valid;

alter table public.memberships
  add constraint memberships_roles_valid check (
    cardinality(roles) > 0
    and roles <@ array['admin','professor','treinador','arbitro','visualizador']::text[]
  );

alter table public.invitations
  add column if not exists roles text[] not null default '{}';

update public.invitations
set roles = array[role::text]
where cardinality(roles) = 0;

alter table public.invitations
  drop constraint if exists invitations_roles_valid;

alter table public.invitations
  add constraint invitations_roles_valid check (
    cardinality(roles) > 0
    and roles <@ array['admin','professor','treinador','arbitro','visualizador']::text[]
  );

create or replace function public.has_org_role(org_id uuid, allowed public.app_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org_id
      and user_id = auth.uid()
      and active
      and (
        role = any(allowed)
        or roles && array(select value::text from unnest(allowed) as value)
      )
  );
$$;

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
        and (
          m.role::text in ('admin','professor','treinador')
          or m.roles && array['admin','professor','treinador']::text[]
        )
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
        and (
          m.role::text in ('admin','professor','treinador')
          or m.roles && array['admin','professor','treinador']::text[]
        )
    )
  );

create or replace function public.claim_invitation(invite_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.invitations%rowtype;
  current_email text;
  assigned_roles text[];
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta.';
  end if;

  select lower(email) into current_email from auth.users where id = auth.uid();

  select * into invitation_record
  from public.invitations
  where token = invite_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if invitation_record.id is null then
    raise exception 'Convite inválido ou expirado.';
  end if;

  if lower(invitation_record.email) <> current_email then
    raise exception 'Este convite pertence a outro e-mail.';
  end if;

  assigned_roles := case
    when cardinality(invitation_record.roles) > 0 then invitation_record.roles
    else array[invitation_record.role::text]
  end;

  insert into public.memberships (organization_id, user_id, role, roles, active)
  values (
    invitation_record.organization_id,
    auth.uid(),
    assigned_roles[1]::public.app_role,
    assigned_roles,
    true
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role, roles = excluded.roles, active = true;

  update public.invitations
  set accepted_at = now()
  where id = invitation_record.id;

  return jsonb_build_object(
    'organization_id', invitation_record.organization_id,
    'roles', assigned_roles
  );
end;
$$;

grant execute on function public.claim_invitation(uuid) to authenticated;
