import { defineMiddleware } from 'astro:middleware';
import { privateResponse } from './lib/admin/access';
import { authorizeAdmin } from './lib/admin/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/$/, '') || '/';
  const adminPage = path === '/admin' || path.startsWith('/admin/');
  const adminApi = path.startsWith('/api/admin/');
  if (!adminPage && !adminApi) return next();

  if (path === '/admin/login' || path === '/api/admin/login' || path === '/api/admin/logout') {
    return privateResponse(await next());
  }

  const access = await authorizeAdmin(context);
  if (access.status !== 'authorized') {
    if (adminApi) {
      return new Response(JSON.stringify({ status: 'unavailable' }), {
        status: access.status === 'disabled' || access.status === 'unavailable' ? 503 : access.status === 'forbidden' ? 403 : 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
      });
    }
    if (access.status === 'unavailable') return privateResponse(new Response('Akses admin sementara tidak tersedia.', { status: 503 }));
    if (access.status === 'forbidden') return privateResponse(new Response('Akses admin tidak diizinkan.', { status: 403 }));
    return privateResponse(context.redirect('/admin/login', 303));
  }

  context.locals.admin = access.identity;
  return privateResponse(await next());
});
