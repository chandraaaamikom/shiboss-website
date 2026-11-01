-- REVIEW ONLY. Requires public.profiles from either the standalone admin
-- profile migration or 202610250001_customer_orders.sql.
-- Do not apply to the main Shiboss project without explicit approval.
-- An administrator account must be provisioned separately by a trusted operator.

begin;

-- Profiles remain closed to anonymous visitors and to client-side writes.
revoke all privileges on table public.profiles from public, anon, authenticated;
grant select (id, full_name, role) on table public.profiles to authenticated;

drop policy if exists "Read own admin profile" on public.profiles;
create policy "Read own admin profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) and role = 'admin');

commit;
