import type { APIRoute } from 'astro';
import { MENU_MUTATIONS_ENABLED, MENU_UPLOAD_ENABLED } from 'astro:env/server';
import { authorizeAdmin, createAdminClient } from '../../../../lib/admin/supabase';
import { adminMenuWritePort } from '../../../../lib/admin/menu-service';
import { handleMenuWriteRequest } from '../../../../lib/admin/menu-request';
import { handlePhotoMenuRequest } from '../../../../lib/admin/menu-photo';

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const access = await authorizeAdmin({ request, cookies });
  const enabled = MENU_MUTATIONS_ENABLED === 'true';
  const client = access.status === 'authorized' && enabled ? createAdminClient({ request, cookies }) : null;
  if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))
    return handlePhotoMenuRequest({ request, access: access.status, enabled: enabled && MENU_UPLOAD_ENABLED === 'true', mode: 'edit', id: params.id, client });
  return handleMenuWriteRequest({
    request, enabled, access: access.status, mode: 'edit', id: params.id,
    port: client ? adminMenuWritePort(client) : undefined,
  });
};
