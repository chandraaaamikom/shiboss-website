-- REVIEW ONLY. Do not apply to production before isolated RLS tests and approval.
-- Requires the reviewed public.menu_items and public.profiles schemas.
-- No DELETE grant or policy; no Storage changes.
begin;

do $$
begin
  if to_regclass('public.menu_items') is null or to_regclass('public.profiles') is null then
    raise exception 'Required menu or profiles table is missing';
  end if;
  if not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'id'
        and atttypid = 'uuid'::regtype and attnotnull)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'name'
        and atttypid = 'text'::regtype and attnotnull)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'category'
        and atttypid = 'text'::regtype and attnotnull)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'description'
        and atttypid = 'text'::regtype)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'price'
        and format_type(atttypid, atttypmod) = 'numeric(12,2)' and attnotnull)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'image_url'
        and atttypid = 'text'::regtype)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.menu_items'::regclass and attname = 'is_available'
        and atttypid = 'boolean'::regtype and attnotnull)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.profiles'::regclass and attname = 'id'
        and atttypid = 'uuid'::regtype)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.profiles'::regclass and attname = 'role'
        and atttypid = 'text'::regtype)
    or not exists (select 1 from pg_attribute
      where attrelid = 'public.profiles'::regclass and attname = 'full_name'
        and atttypid = 'text'::regtype) then
    raise exception 'Menu or profiles schema differs from the reviewed local contract';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.menu_items'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'RLS must already be enabled on menu_items and profiles';
  end if;
  if exists (select 1 from pg_roles
      where rolname in ('anon', 'authenticated') and rolbypassrls)
    or exists (select 1 from pg_class c join pg_roles r on r.oid = c.relowner
      where c.oid in ('public.menu_items'::regclass, 'public.profiles'::regclass)
        and r.rolname in ('anon', 'authenticated')) then
    raise exception 'API roles must not bypass RLS or own the protected tables';
  end if;
  if not has_table_privilege('anon', 'public.menu_items', 'SELECT')
    or not has_table_privilege('authenticated', 'public.menu_items', 'SELECT')
    or (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'menu_items') <> 1
    or not exists (select 1 from pg_policies
        where schemaname = 'public' and tablename = 'menu_items'
          and policyname = 'Read available menu only' and cmd = 'SELECT') then
    raise exception 'Public menu read configuration differs from the reviewed migration';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'profiles') <> 1
    or not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'profiles'
        and policyname = 'Read own admin profile' and cmd = 'SELECT') then
    raise exception 'Profile policy differs from the reviewed admin schema';
  end if;
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.profiles'::regclass
      and a.attnum > 0 and not a.attisdropped
      and (has_column_privilege('anon', a.attrelid, a.attname, 'INSERT')
        or has_column_privilege('anon', a.attrelid, a.attname, 'UPDATE')
        or has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
        or has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE'))
  ) or has_table_privilege('anon', 'public.profiles', 'DELETE')
    or has_table_privilege('authenticated', 'public.profiles', 'DELETE')
    or has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE') then
    raise exception 'Unreviewed profile write grant could allow role escalation';
  end if;
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.menu_items'::regclass
      and a.attnum > 0 and not a.attisdropped
      and (has_column_privilege('anon', a.attrelid, a.attname, 'INSERT')
        or has_column_privilege('anon', a.attrelid, a.attname, 'UPDATE')
        or has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
        or has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE'))
  ) or has_table_privilege('anon', 'public.menu_items', 'DELETE')
    or has_table_privilege('authenticated', 'public.menu_items', 'DELETE')
    or has_table_privilege('anon', 'public.menu_items', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.menu_items', 'TRUNCATE') then
    raise exception 'Unreviewed menu write grant already exists';
  end if;
  if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'menu_items'
        and policyname in ('Admin read all menu', 'Admin insert menu', 'Admin update menu')) then
    raise exception 'Admin menu policy already exists; review it before applying';
  end if;
end;
$$;

grant select on public.menu_items to authenticated;
grant insert (name, description, category, price, is_available)
  on public.menu_items to authenticated;
grant update (name, description, category, price, is_available)
  on public.menu_items to authenticated;

create policy "Admin read all menu"
on public.menu_items for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
    and length(btrim(p.full_name)) > 0
));

create policy "Admin insert menu"
on public.menu_items for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
    and length(btrim(p.full_name)) > 0
));

create policy "Admin update menu"
on public.menu_items for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
    and length(btrim(p.full_name)) > 0
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
    and length(btrim(p.full_name)) > 0
));

commit;
