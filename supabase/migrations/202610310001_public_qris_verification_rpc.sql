-- SHIBOSS production: public RPC wrapper for authenticated QRIS verification.
-- Apply only after reviewing the existing private function and confirming backup.
-- This does not change tables or existing menu data.

begin;

create or replace function public.verify_qris_payment(
  p_payment_id uuid,
  p_decision text
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select shiboss_private.verify_qris_payment(p_payment_id, p_decision);
$function$;

revoke all on function public.verify_qris_payment(uuid, text)
from public, anon, authenticated;

grant execute on function public.verify_qris_payment(uuid, text)
to authenticated;

commit;
