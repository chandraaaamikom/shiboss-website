import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../../../lib/admin/supabase';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const id = params.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ status: 'invalid', message: 'ID pembayaran tidak valid.' }, { status: 400, headers });
  }

  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ status: 'invalid', message: 'Permintaan tidak diizinkan.' }, { status: 403, headers });
  }

  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return Response.json({ status: 'invalid', message: 'Format permintaan tidak valid.' }, { status: 415, headers });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048) throw new Error('too_large');
    body = JSON.parse(raw);
  } catch {
    return Response.json({ status: 'invalid', message: 'Data permintaan tidak valid.' }, { status: 400, headers });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)
      || !['paid', 'rejected'].includes(String((body as Record<string, unknown>).decision))) {
    return Response.json({ status: 'invalid', message: 'Keputusan pembayaran tidak valid.' }, { status: 400, headers });
  }

  const client = createAdminClient({ request, cookies });
  if (!client) return Response.json({ status: 'unavailable', message: 'Layanan admin belum tersedia.' }, { status: 503, headers });

  const { data, error } = await client.rpc('verify_qris_payment', {
    p_payment_id: id,
    p_decision: (body as { decision: 'paid' | 'rejected' }).decision,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 409 : 503;
    return Response.json({
      status: 'error',
      message: error.code === 'P0002'
        ? 'Pembayaran tidak ditemukan atau sudah diverifikasi.'
        : 'Verifikasi belum berhasil. Periksa koneksi dan hak akses database.',
    }, { status, headers });
  }

  return Response.json({ status: 'ready', result: data }, { status: 200, headers });
};
