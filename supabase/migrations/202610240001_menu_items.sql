-- REVIEW ONLY: do not apply without explicit approval.
-- Increment 1: public, read-only access to available menu items.

begin;

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  category text not null check (length(trim(category)) > 0),
  price numeric(12, 2) not null check (price > 0),
  image_url text,
  is_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_items enable row level security;

revoke all privileges on table public.menu_items
from public, anon, authenticated;

grant select on table public.menu_items
to anon, authenticated;

create policy "Read available menu only"
on public.menu_items
for select
to anon, authenticated
using (is_available is true);

create function public.set_menu_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all privileges on function public.set_menu_updated_at()
from public, anon, authenticated;

create trigger menu_updated_at
before update on public.menu_items
for each row
execute function public.set_menu_updated_at();

commit;
