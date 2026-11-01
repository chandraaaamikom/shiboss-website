
import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
} from 'astro:env/server';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const orderPattern = /^SHB-[0-9a-f]{32}$/;
const tokenPattern = /^[0-9a-f]{64}$/;

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

function validImage(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') {
    return (
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (mime === 'image/png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (mime === 'image/webp') {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  }

  return false;
}

async function removeUploadedFile(
  path: string,
  secret: string,
  baseUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(
      new URL('/storage/v1/object/payment-proofs', baseUrl),
      {
        method: 'DELETE',
        headers: {
          apikey: secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefixes: [path],
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;

  // 1. Validasi origin.
  if (request.headers.get('origin') !== origin) {
    return Response.json(
      {
        status: 'invalid',
        message: 'Permintaan tidak diizinkan.',
      },
      { status: 403, headers }
    );
  }

  // 2. Validasi content type.
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('multipart/form-data;')
  ) {
    return Response.json(
      {
        status: 'invalid',
        message: 'Format permintaan tidak valid.',
      },
      { status: 415, headers }
    );
  }

  // 3. Batasi ukuran request.
  const contentLengthHeader =
    request.headers.get('content-length');

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return Response.json(
        {
          status: 'invalid',
          message: 'Ukuran permintaan tidak valid.',
        },
        { status: 400, headers }
      );
    }

    const contentLength = Number(contentLengthHeader);

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > MAX_FILE_SIZE + 65536
    ) {
      return Response.json(
        {
          status: 'invalid',
          message: 'Ukuran permintaan maksimal 5 MB.',
        },
        { status: 413, headers }
      );
    }
  }

  // 4. Baca multipart form.
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return Response.json(
      {
        status: 'invalid',
        message: 'Data upload tidak valid.',
      },
      { status: 400, headers }
    );
  }

  const orderNumber = form.get('order_number');
  const token = form.get('guest_access_token');
  const proof = form.get('proof');

  if (
    typeof orderNumber !== 'string' ||
    !orderPattern.test(orderNumber) ||
    typeof token !== 'string' ||
    !tokenPattern.test(token) ||
    !(proof instanceof File)
  ) {
    return Response.json(
      {
        status: 'invalid',
        message: 'Data pesanan atau bukti pembayaran tidak valid.',
      },
      { status: 400, headers }
    );
  }

  // 5. Validasi ukuran dan jenis file.
  if (
    proof.size <= 0 ||
    proof.size > MAX_FILE_SIZE
  ) {
    return Response.json(
      {
        status: 'invalid',
        message: 'Ukuran gambar maksimal 5 MB.',
      },
      { status: 413, headers }
    );
  }

  if (!allowedTypes.includes(proof.type)) {
    return Response.json(
      {
        status: 'invalid',
        message: 'Format gambar harus JPEG, PNG, atau WebP.',
      },
      { status: 415, headers }
    );
  }

  // 6. Validasi konfigurasi Supabase.
  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    !SUPABASE_SECRET_KEY ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(
      SUPABASE_PUBLISHABLE_KEY
    ) ||
    !/^sb_secret_[A-Za-z0-9_-]+$/.test(
      SUPABASE_SECRET_KEY
    )
  ) {
    return Response.json(
      {
        status: 'unavailable',
        message: 'Layanan upload belum tersedia.',
      },
      { status: 503, headers }
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(SUPABASE_URL);

    if (baseUrl.protocol !== 'https:') {
      throw new Error('Invalid Supabase URL');
    }
  } catch {
    return Response.json(
      {
        status: 'unavailable',
        message: 'Konfigurasi layanan tidak valid.',
      },
      { status: 503, headers }
    );
  }

  const secret = SUPABASE_SECRET_KEY;
  const publishable = SUPABASE_PUBLISHABLE_KEY;
  const base = baseUrl.toString();

  // 7. Baca dan validasi isi gambar.
  let bytes: Uint8Array;

  try {
    bytes = new Uint8Array(await proof.arrayBuffer());
  } catch {
    return Response.json(
      {
        status: 'invalid',
        message: 'Gambar tidak dapat dibaca.',
      },
      { status: 400, headers }
    );
  }

  if (!validImage(bytes, proof.type)) {
    return Response.json(
      {
        status: 'invalid',
        message: 'Isi file bukan gambar yang valid.',
      },
      { status: 415, headers }
    );
  }

  // 8. Siapkan identitas akses pelanggan.
  const tokenHash = createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');

  const extension =
    proof.type === 'image/jpeg'
      ? 'jpg'
      : proof.type === 'image/png'
        ? 'png'
        : 'webp';

  const filename =
    `${randomBytes(16).toString('hex')}.${extension}`;

  const path = `orders/${orderNumber}/${filename}`;

  let uploaded = false;

  try {
    // 9. Verifikasi pesanan sebelum upload.
    const accessResponse = await fetch(
      new URL('/rest/v1/rpc/get_guest_order', base),
      {
        method: 'POST',
        headers: {
          apikey: publishable,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_order_number: orderNumber,
          p_token_hash: tokenHash,
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!accessResponse.ok) {
      return Response.json(
        {
          status: 'unavailable',
          message: 'Akses pesanan belum dapat diverifikasi.',
        },
        { status: 503, headers }
      );
    }

    const access: unknown = await accessResponse.json();

    if (
      !access ||
      typeof access !== 'object' ||
      Array.isArray(access)
    ) {
      return Response.json(
        {
          status: 'invalid',
          message: 'Pesanan tidak ditemukan atau akses tidak valid.',
        },
        { status: 404, headers }
      );
    }

    const guestOrder =
      access as Record<string, unknown>;

    if (guestOrder.order_number !== orderNumber) {
      return Response.json(
        {
          status: 'invalid',
          message: 'Akses pesanan tidak valid.',
        },
        { status: 404, headers }
      );
    }

    const payment = guestOrder.payment;

    if (
      !payment ||
      typeof payment !== 'object' ||
      Array.isArray(payment)
    ) {
      return Response.json(
        {
          status: 'unavailable',
          message: 'Informasi pembayaran belum tersedia.',
        },
        { status: 409, headers }
      );
    }

    const paymentData =
      payment as Record<string, unknown>;

    if (
      paymentData.payment_method !== 'qris' ||
      paymentData.payment_status !== 'pending'
    ) {
      return Response.json(
        {
          status: 'invalid',
          message: 'Pembayaran tidak dapat menerima bukti baru.',
        },
        { status: 409, headers }
      );
    }

    // 10. Upload file ke bucket privat.
    const storageUrl = new URL(
      `/storage/v1/object/payment-proofs/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      base
    );

    const uploadBody = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(uploadBody).set(bytes);

    const uploadResponse = await fetch(storageUrl, {
      method: 'POST',
      headers: {
        apikey: secret,
        'Content-Type': proof.type,
        'x-upsert': 'false',
      },
      body: uploadBody,
      signal: AbortSignal.timeout(20000),
    });

    if (!uploadResponse.ok) {
      return Response.json(
        {
          status: 'error',
          message: 'Bukti pembayaran gagal diunggah.',
        },
        { status: 502, headers }
      );
    }

    uploaded = true;

    // 11. Simpan lokasi file melalui RPC.
    const rpcResponse = await fetch(
      new URL('/rest/v1/rpc/submit_payment_proof', base),
      {
        method: 'POST',
        headers: {
          apikey: publishable,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_order_number: orderNumber,
          p_token_hash: tokenHash,
          p_proof_path: path,
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!rpcResponse.ok) {
      const cleaned = await removeUploadedFile(
        path,
        secret,
        base
      );

      uploaded = !cleaned;

      return Response.json(
        {
          status: 'error',
          message: cleaned
            ? 'Bukti belum dapat disimpan. Silakan coba lagi.'
            : 'Penyimpanan gagal dan pembersihan file belum terkonfirmasi. Hubungi staf kedai.',
        },
        { status: 409, headers }
      );
    }

    const result: unknown = await rpcResponse.json();

    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      (result as Record<string, unknown>).order_number !==
        orderNumber ||
      (result as Record<string, unknown>).payment_status !==
        'pending'
    ) {
      const cleaned = await removeUploadedFile(
        path,
        secret,
        base
      );

      uploaded = !cleaned;

      return Response.json(
        {
          status: 'error',
          message: 'Konfirmasi upload belum dapat diverifikasi.',
        },
        { status: 502, headers }
      );
    }

    uploaded = false;

    return Response.json(
      {
        status: 'ready',
        message: 'Bukti pembayaran berhasil dikirim.',
        payment: result,
      },
      { status: 200, headers }
    );

  } catch {
    if (uploaded) {
      await removeUploadedFile(path, secret, base);
    }

    return Response.json(
      {
        status: 'error',
        message: 'Koneksi bermasalah. Periksa kembali status upload sebelum mencoba ulang.',
      },
      { status: 503, headers }
    );
  }
};
