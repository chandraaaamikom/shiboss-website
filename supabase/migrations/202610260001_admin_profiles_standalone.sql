-- REVIEW ONLY. Apply this file alone only after isolated testing and explicit approval.
-- Creates the admin identity table without orders, payments, or anonymous RPCs.
-- Compatible with the earlier, still-local Increment 2 migrations if they were
-- already applied in an isolated database. It never provisions an admin user.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  role text not null check (role = 'admin'),
  created_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS must not silently accept an unrelated table.
do $$
begin
  if (select count(*) from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::regclass
        and a.attnum > 0 and not a.attisdropped) <> 4
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attname = 'id'
        and a.atttypid = 'uuid'::regtype and a.attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attname = 'full_name'
        and a.atttypid = 'text'::regtype and a.attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attname = 'role'
        and a.atttypid = 'text'::regtype and a.attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attname = 'created_at'
        and a.atttypid = 'timestamptz'::regtype and a.attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute a
      join pg_catalog.pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.profiles'::regclass and a.attname = 'created_at'
        and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'now()')
  then
    raise exception 'Existing public.profiles shape differs from the reviewed admin schema';
  end if;

  if not exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.profiles'::regclass
        and c.conname = 'profiles_pkey' and c.contype = 'p')
    or not exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.profiles'::regclass
        and c.conname = 'profiles_id_fkey' and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'r')
    or not exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.profiles'::regclass
        and c.conname = 'profiles_full_name_check' and c.contype = 'c')
    or not exists (select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.profiles'::regclass
        and c.conname = 'profiles_role_check' and c.contype = 'c')
  then
    raise exception 'Existing public.profiles constraints differ from the reviewed admin schema';
  end if;

  if exists (select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'profiles'
        and p.policyname <> 'Read own admin profile')
  then
    raise exception 'Unreviewed policy exists on public.profiles';
  end if;
end;
$$;

alter table public.profiles enable row level security;
revoke all privileges on table public.profiles from public, anon, authenticated;
grant select (id, full_name, role) on table public.profiles to authenticated;

-- Recreate the known policy when the older admin migration ran first.
drop policy if exists "Read own admin profile" on public.profiles;
create policy "Read own admin profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) and role = 'admin');

commit;
