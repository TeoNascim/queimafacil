create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.app_role not null,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index invitations_org_idx on public.invitations(organization_id);
create index invitations_token_idx on public.invitations(token);

alter table public.invitations enable row level security;

create policy invitations_admin_read on public.invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['admin']::public.app_role[]));

create policy invitations_admin_create on public.invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.has_org_role(organization_id, array['admin']::public.app_role[])
  );

create policy invitations_admin_update on public.invitations
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin']::public.app_role[]));

create policy invitations_admin_delete on public.invitations
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin']::public.app_role[]));

create or replace function public.claim_invitation(invite_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.invitations%rowtype;
  current_email text;
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

  insert into public.memberships (organization_id, user_id, role, active)
  values (invitation_record.organization_id, auth.uid(), invitation_record.role, true)
  on conflict (organization_id, user_id) do update
    set role = excluded.role, active = true;

  update public.invitations
    set accepted_at = now()
    where id = invitation_record.id;

  return jsonb_build_object(
    'organization_id', invitation_record.organization_id,
    'role', invitation_record.role
  );
end;
$$;

grant execute on function public.claim_invitation(uuid) to authenticated;
