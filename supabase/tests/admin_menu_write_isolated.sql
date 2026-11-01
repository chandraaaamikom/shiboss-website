-- Destructive synthetic test: run ONLY in a dedicated local shiboss_test database.
-- Prerequisites: bootstrap_isolated.sql, bootstrap_admin_menu_isolated.sql,
-- menu_items migration, standalone profiles migration, admin menu write migration.
begin;

do $$
begin
  if current_database() !~ '^shiboss_test(_[a-z0-9_]+)?$'
    or inet_server_addr() is null
    or inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
    raise exception 'Refusing to run outside a local isolated shiboss_test database';
  end if;
end $$;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000202');
insert into public.profiles (id, full_name, role)
values ('00000000-0000-4000-8000-000000000201', 'Admin Uji', 'admin');
insert into public.menu_items (name, category, price, is_available)
values ('Menu nonaktif sintetis', 'Uji', 1000, false);
insert into public.menu_items (name, category, price, is_available)
values ('Menu aktif sintetis', 'Uji', 1200, true);

set local role anon;
do $$
declare denied boolean := false;
        update_denied boolean := false;
        delete_denied boolean := false;
begin
  if not exists (select 1 from public.menu_items where name = 'Menu aktif sintetis') then
    raise exception 'anon cannot read active menu';
  end if;
  if exists (select 1 from public.menu_items where name = 'Menu nonaktif sintetis') then
    raise exception 'anon saw inactive menu';
  end if;
  begin
    insert into public.menu_items (name, category, price, is_available)
    values ('Tidak boleh masuk', 'Uji', 1000, true);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anon inserted menu'; end if;
  begin
    update public.menu_items set price = 9900 where name = 'Menu aktif sintetis';
  exception when insufficient_privilege then update_denied := true;
  end;
  if not update_denied then raise exception 'anon updated menu'; end if;
  begin
    delete from public.menu_items where name = 'Menu aktif sintetis';
  exception when insufficient_privilege then delete_denied := true;
  end;
  if not delete_denied then raise exception 'anon deleted menu'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000202';
do $$
declare denied boolean := false;
        delete_denied boolean := false;
begin
  if not exists (select 1 from public.menu_items where name = 'Menu aktif sintetis') then
    raise exception 'non-admin cannot read active menu';
  end if;
  if exists (select 1 from public.menu_items where name = 'Menu nonaktif sintetis') then
    raise exception 'non-admin saw inactive menu';
  end if;
  begin
    insert into public.menu_items (name, category, price, is_available)
    values ('Tidak boleh masuk', 'Uji', 1000, true);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'non-admin inserted menu'; end if;
  update public.menu_items set price = 9900 where name = 'Menu aktif sintetis';
  if found then raise exception 'non-admin updated menu'; end if;
  begin
    delete from public.menu_items where name = 'Menu aktif sintetis';
  exception when insufficient_privilege then delete_denied := true;
  end;
  if not delete_denied then raise exception 'non-admin deleted menu'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000201';
do $$
declare created_id uuid;
        denied boolean := false;
        invalid_price_denied boolean := false;
        profile_write_denied boolean := false;
        image_write_denied boolean := false;
begin
  if not exists (select 1 from public.menu_items where name = 'Menu nonaktif sintetis') then
    raise exception 'admin cannot read inactive menu';
  end if;
  insert into public.menu_items (name, category, price, is_available)
  values ('Menu buatan uji', 'Uji', 1500, true) returning id into created_id;
  update public.menu_items set price = 2000, is_available = false where id = created_id;
  if not exists (select 1 from public.menu_items
      where id = created_id and price = 2000 and is_available is false) then
    raise exception 'admin edit or availability change failed';
  end if;
  begin
    insert into public.menu_items (name, category, price, is_available)
    values ('Harga salah', 'Uji', -1, true);
  exception when check_violation then invalid_price_denied := true;
  end;
  if not invalid_price_denied then raise exception 'invalid price inserted'; end if;
  begin
    update public.menu_items set image_url = 'https://example.invalid/photo.png'
    where id = created_id;
  exception when insufficient_privilege then image_write_denied := true;
  end;
  if not image_write_denied then raise exception 'admin changed image_url'; end if;
  begin
    update public.profiles set role = 'admin'
    where id = '00000000-0000-4000-8000-000000000202';
  exception when insufficient_privilege then profile_write_denied := true;
  end;
  if not profile_write_denied then raise exception 'profile role update unexpectedly allowed'; end if;
  begin
    delete from public.menu_items where id = created_id;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'permanent delete unexpectedly allowed'; end if;
end $$;
reset role;

set local role anon;
do $$
begin
  if exists (select 1 from public.menu_items where name = 'Menu buatan uji') then
    raise exception 'newly disabled menu remains publicly visible';
  end if;
  if not exists (select 1 from public.menu_items where name = 'Menu aktif sintetis') then
    raise exception 'public active menu became inaccessible';
  end if;
end $$;
reset role;

rollback;
