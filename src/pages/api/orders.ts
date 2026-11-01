import type { APIRoute } from 'astro';
import { ORDERS_ENABLED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import { createOrderFrom } from '../../lib/services/order-core.ts';

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return Response.json({ status: 'invalid', message: 'Format pesanan tidak valid.' }, { status: 415, headers });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ status: 'invalid', message: 'Permintaan tidak diizinkan.' }, { status: 403, headers });
  }
  if (ORDERS_ENABLED !== 'true') {
    return Response.json({ status: 'unavailable', message: 'Pemesanan online belum tersedia. Silakan hubungi staf kedai.' }, { status: 503, headers });
  }
  let input: unknown;
  try {
    if (Number(request.headers.get('content-length')) > 16_384) throw new Error('large');
    const text = await request.text();
    if (text.length > 16_384) throw new Error('large');
    input = JSON.parse(text);
  } catch {
    return Response.json({ status: 'invalid', message: 'Data pesanan tidak valid.' }, { status: 400, headers });
  }
  const result = await createOrderFrom(input, { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY });
  const status = result.status === 'ready' ? 201 : result.status === 'invalid' ? 400 : result.status === 'changed' ? 409 : 503;
  return Response.json(result, { status, headers });
};
