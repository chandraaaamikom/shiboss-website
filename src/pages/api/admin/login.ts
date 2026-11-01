import type { APIRoute } from 'astro';
import { isAdminProfile, isSameOriginForm } from '../../../lib/admin/access';
import { createAdminClient } from '../../../lib/admin/supabase';

function back(request: Request, status: string): Response {
  return Response.redirect(new URL(`/admin/login?status=${status}`, request.url), 303);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginForm(request)) return new Response('Permintaan tidak valid.', { status: 403 });
  const client = createAdminClient({ request, cookies });
  if (!client) return back(request, 'setup');

  let fields: URLSearchParams;
  try {
    const body = await request.text();
    if (body.length > 4096) return new Response('Permintaan terlalu besar.', { status: 413 });
    fields = new URLSearchParams(body);
  } catch {
    return back(request, 'invalid');
  }

  const email = fields.get('email')?.trim() ?? '';
  const password = fields.get('password') ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) {
    return back(request, 'invalid');
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) return back(request, 'invalid');

    const { data: profile, error: profileError } = await client.from('profiles')
      .select('id,full_name,role').eq('id', data.user.id).maybeSingle();
    if (profileError || !isAdminProfile(profile, data.user.id)) {
      await client.auth.signOut({ scope: 'local' });
      return back(request, profileError ? 'unavailable' : 'denied');
    }
    return Response.redirect(new URL('/admin', request.url), 303);
  } catch {
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* the server guard still rejects access */ }
    return back(request, 'unavailable');
  }
};
