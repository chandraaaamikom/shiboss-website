-- REVIEW ONLY. Do not apply to the main Shiboss project without explicit approval.
-- Assumes the Increment 1 public.menu_items table exists.
-- The only anonymous write surface is the validated, atomic create_table_order RPC.

begin;

create schema shiboss_private;
revoke all on schema shiboss_private from public, anon, authenticated;

-- The standalone admin-profile migration may have created this table earlier.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  role text not null check (role = 'admin'),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  order_source text not null check (order_source in ('table_qr', 'cashier')),
  customer_name text not null check (length(btrim(customer_name)) between 1 and 100),
  table_number text check (table_number is null or length(btrim(table_number)) between 1 and 30),
  notes text check (notes is null or length(notes) <= 500),
  total_amount numeric(12, 2) not null check (total_amount > 0),
  order_status text not null default 'pending' check (order_status in ('pending', 'confirmed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_origin_identity check (
    (order_source = 'table_qr' and table_number is not null and created_by is null)
    or (order_source = 'cashier' and created_by is not null)
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  product_name text not null check (length(btrim(product_name)) > 0),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price > 0),
  subtotal numeric(12, 2) generated always as (unit_price * quantity) stored,
  unique (order_id, menu_item_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  payment_method text not null check (payment_method in ('cash', 'qris')),
  amount numeric(12, 2) not null check (amount > 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'rejected')),
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_verification_consistent check (
    (payment_status = 'pending' and verified_by is null and verified_at is null)
    or (payment_status in ('paid', 'rejected') and verified_by is not null and verified_at is not null)
  )
);

create index order_items_order_id_idx on public.order_items(order_id);
create index orders_created_at_idx on public.orders(created_at desc);
create index payments_status_idx on public.payments(payment_status, created_at desc);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;


revoke all privileges on public.profiles, public.orders, public.order_items, public.payments
from public, anon, authenticated;

-- Pertahankan akses baca profil admin untuk proses autentikasi.
grant select (id, full_name, role)
on table public.profiles
to authenticated;

-- No table policies or table grants for anonymous customers.
-- Admin policies belong to Increment 3.

create function shiboss_private.create_table_order(
  p_customer_name text,
  p_table_number text,
  p_notes text,
  p_items jsonb,
  p_expected_total numeric,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(p_customer_name);
  v_table text := pg_catalog.btrim(p_table_number);
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_item jsonb;
  v_items_by_id jsonb := '{}'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_product_name text;
  v_price numeric(12, 2);
  v_total numeric(12, 2) := 0;
  v_fingerprint text;
  v_existing public.orders%rowtype;
  v_order_id uuid;
  v_line record;
  v_receipt jsonb;
begin
  if p_idempotency_key is null or v_name is null or length(v_name) not between 1 and 100
    or v_table is null or length(v_table) not between 1 and 30
    or (v_notes is not null and length(v_notes) > 500)
    or p_expected_total is null or p_expected_total <= 0 or p_expected_total <> round(p_expected_total, 2)
    or p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
  then
    raise exception using errcode = '22023', message = 'INVALID_ORDER';
  end if;
  if pg_catalog.jsonb_array_length(p_items) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 2
      or not (v_item ? 'menu_item_id' and v_item ? 'quantity')
      or pg_catalog.jsonb_typeof(v_item->'menu_item_id') <> 'string'
      or pg_catalog.jsonb_typeof(v_item->'quantity') <> 'number'
      or (v_item->>'quantity') !~ '^[1-9][0-9]{0,9}$'
      or (v_item->>'menu_item_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then
      raise exception using errcode = '22023', message = 'INVALID_ORDER';
    end if;
    if (v_item->>'quantity')::numeric > 2147483647 then
      raise exception using errcode = '22023', message = 'INVALID_ORDER';
    end if;
    v_item_id := (v_item->>'menu_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    if v_items_by_id ? v_item_id::text then
      raise exception using errcode = '22023', message = 'INVALID_ORDER';
    end if;
    v_items_by_id := v_items_by_id || pg_catalog.jsonb_build_object(v_item_id::text, v_quantity);
  end loop;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_array(v_name, v_table, v_notes, v_items_by_id, p_expected_total)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    select pg_catalog.jsonb_build_object(
      'order_number', o.order_number, 'order_status', o.order_status,
      'payment_status', p.payment_status, 'payment_method', p.payment_method,
      'total_amount', o.total_amount,
      'items', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'product_name', i.product_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'subtotal', i.subtotal) order by i.product_name, i.id)
        from public.order_items i where i.order_id = o.id)
    ) into v_receipt from public.orders o join public.payments p on p.order_id = o.id
    where o.id = v_existing.id;
    return v_receipt;
  end if;

  for v_line in select key::uuid as id, value::integer as quantity from pg_catalog.jsonb_each_text(v_items_by_id) loop
    select name, price into v_product_name, v_price
    from public.menu_items where id = v_line.id and is_available is true for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'MENU_UNAVAILABLE';
    end if;
    v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'menu_item_id', v_line.id, 'product_name', v_product_name,
      'quantity', v_line.quantity, 'unit_price', v_price,
      'subtotal', v_price * v_line.quantity
    ));
    v_total := v_total + v_price * v_line.quantity;
  end loop;
  if v_total <> p_expected_total then
    raise exception using errcode = 'P0001', message = 'PRICE_CHANGED';
  end if;

  v_order_id := pg_catalog.gen_random_uuid();
  insert into public.orders (
    id, order_number, order_source, customer_name, table_number, notes,
    total_amount, order_status, idempotency_key, request_fingerprint
  ) values (
    v_order_id, 'SHB-' || pg_catalog.replace(v_order_id::text, '-', ''), 'table_qr',
    v_name, v_table, v_notes, v_total, 'pending', p_idempotency_key, v_fingerprint
  );
  for v_item in select value from pg_catalog.jsonb_array_elements(v_lines) loop
    insert into public.order_items (order_id, menu_item_id, product_name, quantity, unit_price)
    values (v_order_id, (v_item->>'menu_item_id')::uuid, v_item->>'product_name',
      (v_item->>'quantity')::integer, (v_item->>'unit_price')::numeric);
  end loop;
  insert into public.payments (order_id, payment_method, amount, payment_status)
  values (v_order_id, 'qris', v_total, 'pending');

  return pg_catalog.jsonb_build_object(
    'order_number', 'SHB-' || pg_catalog.replace(v_order_id::text, '-', ''),
    'order_status', 'pending', 'payment_status', 'pending', 'payment_method', 'qris',
    'total_amount', v_total,
    'items', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'product_name', i.product_name, 'quantity', i.quantity,
      'unit_price', i.unit_price, 'subtotal', i.subtotal) order by i.product_name, i.id)
      from public.order_items i where i.order_id = v_order_id)
  );
end;
$$;

create function public.create_table_order(
  p_customer_name text,
  p_table_number text,
  p_notes text,
  p_items jsonb,
  p_expected_total numeric,
  p_idempotency_key uuid
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select shiboss_private.create_table_order(
    p_customer_name, p_table_number, p_notes, p_items, p_expected_total, p_idempotency_key
  );
$$;

revoke all on function shiboss_private.create_table_order(text, text, text, jsonb, numeric, uuid)
from public, anon, authenticated;
revoke all on function public.create_table_order(text, text, text, jsonb, numeric, uuid)
from public, anon, authenticated;
grant usage on schema shiboss_private to anon;
grant execute on function shiboss_private.create_table_order(text, text, text, jsonb, numeric, uuid) to anon;
grant execute on function public.create_table_order(text, text, text, jsonb, numeric, uuid) to anon;

commit;
