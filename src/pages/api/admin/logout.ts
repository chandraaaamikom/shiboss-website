import type { APIRoute } from 'astro';
import { isSameOriginForm } from '../../../lib/admin/access';
import { createAdminClient } from '../../../lib/admin/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginForm(request)) return new Response('Permintaan tidak valid.', { status: 403 });
  const client = createAdminClient({ request, cookies });
  if (client) {
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) return new Response('Logout belum berhasil. Coba lagi.', { status: 503 });
    } catch {
      return new Response('Logout belum berhasil. Coba lagi.', { status: 503 });
    }
  }
  return Response.redirect(new URL('/admin/login', request.url), 303);
};
