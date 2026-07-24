alter table public.memberships
  add column if not exists created_at timestamptz not null default now();

create index if not exists memberships_created_at_idx
  on public.memberships(created_at);
