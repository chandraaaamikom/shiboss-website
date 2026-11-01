import { ADMIN_ENABLED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { adminEnabled, isAdminProfile, type AdminIdentity } from './access';

type RequestContext = { request: Request; cookies: AstroCookies };

export function isAdminConfigured(): boolean {
  if (!adminEnabled(ADMIN_ENABLED) || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return false;
  try {
    return new URL(SUPABASE_URL).protocol === 'https:'
      && /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY);
  } catch {
    return false;
  }
}

export function createAdminClient({ request, cookies }: RequestContext) {
  if (!isAdminConfigured()) return null;
  return createServerClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get('Cookie') ?? ''),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure: new URL(request.url).protocol === 'https:',
          });
        }
      },
    },
  });
}

export type AdminAccess =
  | { status: 'authorized'; identity: AdminIdentity }
  | { status: 'disabled' | 'unauthenticated' | 'forbidden' | 'unavailable' };

export async function authorizeAdmin(context: RequestContext): Promise<AdminAccess> {
  const client = createAdminClient(context);
  if (!client) return { status: 'disabled' };

  try {
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return { status: 'unauthenticated' };

    const { data: profile, error: profileError } = await client.from('profiles')
      .select('id,full_name,role').eq('id', auth.user.id).maybeSingle();
    if (profileError) return { status: 'unavailable' };
    if (!isAdminProfile(profile, auth.user.id)) return { status: 'forbidden' };

    return {
      status: 'authorized',
      identity: { id: auth.user.id, email: auth.user.email ?? '', fullName: profile.full_name.trim() },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

