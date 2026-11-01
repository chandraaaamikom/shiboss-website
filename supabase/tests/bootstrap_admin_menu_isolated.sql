-- Run only after bootstrap_isolated.sql in a fresh local shiboss_test database.
-- Supabase normally supplies auth.uid(); this is a local test stub.
begin;
do $$
begin
  if current_database() !~ '^shiboss_test(_[a-z0-9_]+)?$'
    or inet_server_addr() is null
    or inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet)
    or to_regclass('auth.users') is null then
    raise exception 'Refusing auth stub outside an isolated bootstrap database';
  end if;
end $$;
create function auth.uid() returns uuid
language sql stable security invoker
set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
commit;
