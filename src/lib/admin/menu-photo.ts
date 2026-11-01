import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMenuWriteInput } from './menu-mutations.ts';

export const MAX_MENU_PHOTO_BYTES = 5 * 1024 * 1024;
export const MENU_PHOTO_BUCKET = 'menu-photos';
const maxRequestBytes = MAX_MENU_PHOTO_BYTES + 32 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export type PhotoFormat = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'jpg' | 'png' | 'webp' };
export function detectPhotoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (bytes.length >= 16 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9)
    return { mime: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 45 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
    && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR'
    && String.fromCharCode(...bytes.slice(-8, -4)) === 'IEND')
    return { mime: 'image/png', extension: 'png' };
  if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.slice(12, 16)))
    && (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) + 8 === bytes.length)
    return { mime: 'image/webp', extension: 'webp' };
  return null;
}

function json(status: number, code: string, message: string): Response {
  return Response.json({ status: code, message }, { status, headers });
}

async function readLimited(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxRequestBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function handlePhotoMenuRequest(args: {
  request: Request;
  access: 'authorized' | 'unauthenticated' | 'forbidden' | 'unavailable' | 'disabled';
  enabled: boolean;
  mode: 'create' | 'edit';
  id?: string;
  client: SupabaseClient | null;
}): Promise<Response> {
  const { request } = args;
  if (args.access !== 'authorized') return json(args.access === 'unauthenticated' ? 401 : 403, 'forbidden', 'Akses admin tidak tersedia.');
  if (!args.enabled || !args.client) return json(503, 'unavailable', 'Upload foto menu belum diaktifkan.');
  if (request.headers.get('origin') !== new URL(request.url).origin) return json(403, 'forbidden', 'Permintaan tidak diizinkan.');
  if (args.mode === 'edit' && (!args.id || !uuid.test(args.id))) return json(400, 'invalid', 'ID menu tidak valid.');
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) return json(415, 'invalid', 'Format data tidak valid.');
  if (Number(request.headers.get('content-length') ?? 0) > maxRequestBytes) return json(413, 'invalid', 'Data terlalu besar.');
  let form: FormData;
  try {
    const body = await readLimited(request);
    if (!body) return json(413, 'invalid', 'Data terlalu besar.');
    form = await new Request(request.url, { method: 'POST', headers: { 'content-type': contentType }, body: new Blob([body.buffer as ArrayBuffer]) }).formData();
  } catch { return json(400, 'invalid', 'Data foto tidak valid.'); }
  const names = [...form.keys()];
  if (names.length !== 6 || new Set(names).size !== 6
    || names.some((key) => !['name', 'category', 'description', 'price', 'is_available', 'photo'].includes(key)))
    return json(400, 'invalid', 'Data menu tidak valid.');
  const photo = form.get('photo');
  if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_MENU_PHOTO_BYTES || photo.name.length > 180)
    return json(400, 'invalid', 'Pilih foto JPEG, PNG, atau WebP berukuran maksimal 5 MB.');
  const imageBytes = new Uint8Array(await photo.arrayBuffer());
  const format = detectPhotoFormat(imageBytes);
  if (!format || photo.type !== format.mime) return json(400, 'invalid', 'Format foto tidak didukung atau isi berkas tidak sesuai.');
  const priceText = form.get('price');
  const price = typeof priceText === 'string' && /^\d+$/.test(priceText) ? Number(priceText) : NaN;
  const input = parseMenuWriteInput({
    name: form.get('name'), category: form.get('category'), description: form.get('description'),
    price, is_available: form.get('is_available') === 'true',
  });
  if (!input || !['true', 'false'].includes(String(form.get('is_available'))))
    return json(400, 'invalid', 'Periksa nama, kategori, deskripsi, harga, dan ketersediaan.');

  const client = args.client;
  const path = `products/${crypto.randomUUID()}.${format.extension}`;
  try {
    const upload = await client.storage.from(MENU_PHOTO_BUCKET).upload(path, imageBytes, {
      contentType: format.mime, cacheControl: '3600', upsert: false,
    });
    if (upload.error) return json(503, 'unavailable', 'Foto belum dapat diunggah. Menu lama tidak diubah.');
    const publicUrl = client.storage.from(MENU_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    if (!publicUrl || !publicUrl.startsWith('https://'))
      return json(503, 'unavailable', 'URL foto tidak tersedia. Menu belum disimpan.');
    const query = args.mode === 'create'
      ? client.from('menu_items').insert({ ...input, image_url: publicUrl })
      : client.from('menu_items').update({ ...input, image_url: publicUrl }).eq('id', args.id!);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data?.id) return json(503, 'unavailable', 'Foto terunggah, tetapi menu belum tersimpan. Hubungi pengelola untuk memeriksa foto yang belum terpakai.');
    return Response.json({ status: 'ready', message: args.mode === 'create' ? 'Menu dan foto berhasil ditambahkan.' : 'Menu dan foto berhasil diperbarui.', id: data.id },
      { status: args.mode === 'create' ? 201 : 200, headers });
  } catch { return json(503, 'unavailable', 'Upload atau penyimpanan gagal. Periksa menu sebelum mencoba lagi.'); }
}
