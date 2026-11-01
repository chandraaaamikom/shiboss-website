import { processMenuMutation, type MenuWritePort } from './menu-mutations.ts';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
class BodyTooLarge extends Error {}

async function readLimitedBody(request: Request): Promise<string> {
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new BodyTooLarge(); }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function handleMenuWriteRequest(args: {
  request: Request;
  enabled: boolean;
  access: 'authorized' | 'unauthenticated' | 'forbidden' | 'unavailable' | 'disabled';
  mode: 'create' | 'edit';
  id?: string;
  port?: MenuWritePort;
}): Promise<Response> {
  const { request } = args;
  if (args.access !== 'authorized') return Response.json({ status: 'forbidden', message: 'Akses admin tidak tersedia.' }, { status: args.access === 'unauthenticated' ? 401 : 403, headers });
  if (!args.enabled) return Response.json({ status: 'unavailable', message: 'Penyimpanan menu belum diaktifkan.' }, { status: 503, headers });
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ status: 'forbidden', message: 'Permintaan tidak diizinkan.' }, { status: 403, headers });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return Response.json({ status: 'invalid', message: 'Format data tidak valid.' }, { status: 415, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    return Response.json({ status: 'invalid', message: 'Data terlalu besar.' }, { status: 413, headers });
  let input: unknown;
  try {
    const body = await readLimitedBody(request);
    input = JSON.parse(body);
  } catch (error) {
    if (error instanceof BodyTooLarge) return Response.json({ status: 'invalid', message: 'Data terlalu besar.' }, { status: 413, headers });
    return Response.json({ status: 'invalid', message: 'Data menu tidak valid.' }, { status: 400, headers });
  }
  const result = await processMenuMutation({ ...args, input });
  const status = result.status === 'ready' ? (args.mode === 'create' ? 201 : 200)
    : result.status === 'invalid' ? 400 : result.status === 'not_found' ? 404
      : result.status === 'forbidden' ? 403 : 503;
  return Response.json(result, { status, headers });
}
