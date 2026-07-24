do $$
declare
  admin_user_id uuid;
  org_id uuid;
begin
  select id
    into admin_user_id
    from auth.users
   where lower(email) = lower('admin@suaescola.com.br')
   limit 1;

  if admin_user_id is null then
    raise exception 'Crie primeiro o usuário admin@suaescola.com.br em Authentication > Users.';
  end if;

  insert into public.profiles (id, full_name, email)
  values (admin_user_id, 'Administrador CoordEDF', 'admin@suaescola.com.br')
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email;

  insert into public.organizations (name, slug)
  values ('CoordEDF', 'coordedf')
  on conflict (slug) do update set name = excluded.name
  returning id into org_id;

  insert into public.memberships (organization_id, user_id, role, active)
  values (org_id, admin_user_id, 'admin', true)
  on conflict (organization_id, user_id) do update
    set role = 'admin',
        active = true;
end;
$$;
