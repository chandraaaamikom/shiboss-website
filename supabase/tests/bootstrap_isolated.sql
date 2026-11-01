-- Only for a fresh, dedicated local shiboss_test database. Never use production.
begin;
do $$
begin
  if current_database() !~ '^shiboss_test(_[a-z0-9_]+)?$'
    or inet_server_addr() is null
    or inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
    raise exception 'Refusing bootstrap outside a loopback shiboss_test database';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
grant usage on schema public to anon, authenticated;
commit;
