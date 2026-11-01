
begin;

-- Admin yang terautentikasi boleh membaca data pesanan.
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.payments to authenticated;

-- Akses baca hanya untuk admin yang profilnya valid.
create policy "Admin read orders"
on public.orders
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and length(btrim(p.full_name)) > 0
  )
);

create policy "Admin read order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and length(btrim(p.full_name)) > 0
  )
);

create policy "Admin read payments"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and length(btrim(p.full_name)) > 0
  )
);

-- Fungsi verifikasi QRIS dengan pemeriksaan identitas admin.
create or replace function shiboss_private.verify_qris_payment(
  p_payment_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_payment public.payments%rowtype;
  v_order_number text;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception using
      errcode = '42501',
      message = 'ADMIN_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_admin_id
      and p.role = 'admin'
      and length(btrim(p.full_name)) > 0
  ) then
    raise exception using
      errcode = '42501',
      message = 'ADMIN_ACCESS_DENIED';
  end if;

  if p_decision is null
   or p_decision not in ('paid', 'rejected') then
    raise exception using
      errcode = '22023',
      message = 'INVALID_PAYMENT_DECISION';
  end if;

  update public.payments
  set payment_status = p_decision,
      verified_by = v_admin_id,
      verified_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_payment_id
    and payment_method = 'qris'
    and payment_status = 'pending'
  returning * into v_payment;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PAYMENT_NOT_PENDING_OR_NOT_FOUND';
  end if;

  select o.order_number
  into v_order_number
  from public.orders o
  where o.id = v_payment.order_id;

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'order_number', v_order_number,
    'payment_status', v_payment.payment_status,
    'verified_by', v_payment.verified_by,
    'verified_at', v_payment.verified_at
  );
end;
$$;

-- Fungsi verifikasi hanya boleh dipanggil pengguna terautentikasi.
revoke all on function
  shiboss_private.verify_qris_payment(uuid, text)
from public, anon, authenticated;

grant usage on schema shiboss_private to authenticated;

grant execute on function
  shiboss_private.verify_qris_payment(uuid, text)
to authenticated;

commit;
