
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from 'astro:env/server';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const tokenPattern = /^[0-9a-f]{64}$/;
const orderPattern = /^SHB-[0-9a-f]{32}$/;

export const POST: APIRoute = async ({ request, params }) => {
  const orderNumber = params.orderNumber;

  if (!orderNumber || !orderPattern.test(orderNumber)) {
    return Response.json(
      { status: 'invalid', message: 'Nomor pesanan tidak valid.' },
      { status: 400, headers }
    );
  }

  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json(
      { status: 'invalid', message: 'Permintaan tidak diizinkan.' },
      { status: 403, headers }
    );
  }

  if (
    request.headers.get('content-type')
      ?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    return Response.json(
      { status: 'invalid', message: 'Format permintaan tidak valid.' },
      { status: 415, headers }
    );
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > 2048) throw new Error('too_large');

    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { status: 'invalid', message: 'Data permintaan tidak valid.' },
      { status: 400, headers }
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof (body as Record<string, unknown>).guest_access_token !== 'string' ||
    !tokenPattern.test(
      (body as Record<string, string>).guest_access_token
    )
  ) {
    return Response.json(
      { status: 'invalid', message: 'Token akses tidak valid.' },
      { status: 400, headers }
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY)
  ) {
    return Response.json(
      { status: 'unavailable', message: 'Layanan belum tersedia.' },
      { status: 503, headers }
    );
  }

  const token = (body as Record<string, string>).guest_access_token;

  const tokenHash = createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');

  try {
    const endpoint = new URL(
      '/rest/v1/rpc/get_guest_order',
      SUPABASE_URL
    );

    if (endpoint.protocol !== 'https:') {
      throw new Error('Invalid Supabase URL');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_order_number: orderNumber,
        p_token_hash: tokenHash,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return Response.json(
        { status: 'unavailable', message: 'Status pesanan belum dapat diperiksa.' },
        { status: 503, headers }
      );
    }

    const result: unknown = await response.json();

    if (!result || typeof result !== 'object') {
      return Response.json(
        { status: 'not_found', message: 'Pesanan tidak ditemukan.' },
        { status: 404, headers }
      );
    }

    return Response.json(
      { status: 'ready', order: result },
      { status: 200, headers }
    );
  } catch {
    return Response.json(
      { status: 'unavailable', message: 'Koneksi sedang bermasalah.' },
      { status: 503, headers }
    );
  }
};
