import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { detectPhotoFormat, handlePhotoMenuRequest, MAX_MENU_PHOTO_BYTES } from '../src/lib/admin/menu-photo.ts';

const id = '00000000-0000-4000-8000-000000000101';
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 0, 1, 255, 217]);
function request(file = new File([jpeg], 'photo.jpg', { type: 'image/jpeg' })) {
  const form = new FormData();
  form.set('name', 'Susu Segar'); form.set('category', 'Special Susu');
  form.set('description', ''); form.set('price', '12000');
  form.set('is_available', 'true'); form.set('photo', file);
  return new Request('http://127.0.0.1:4321/api/admin/menu', {
    method: 'POST', headers: { Origin: 'http://127.0.0.1:4321' }, body: form,
  });
}
function client(dbError = false) {
  const calls: string[] = [];
  const query = { select: () => ({ maybeSingle: async () => dbError ? { data: null, error: { message: 'private' } } : { data: { id }, error: null } }) };
  const fake = {
    storage: { from: () => ({
      upload: async (path: string, _bytes: Uint8Array, options: { upsert: boolean }) => {
        calls.push(`upload:${path}`); assert.equal(options.upsert, false); return { error: null };
      },
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/storage/v1/object/public/menu-photos/products/photo.jpg' } }),
    }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => { calls.push(`insert:${String(row.image_url)}`); return query; },
      update: (row: Record<string, unknown>) => { calls.push(`update:${String(row.image_url)}`); return { eq: () => query }; },
    }),
  } as unknown as SupabaseClient;
  return { fake, calls };
}

test('photo signature accepts only supported types and rejects spoofed content', () => {
  assert.deepEqual(detectPhotoFormat(jpeg), { mime: 'image/jpeg', extension: 'jpg' });
  assert.equal(detectPhotoFormat(new TextEncoder().encode('<svg onload="x">')), null);
  assert.equal(detectPhotoFormat(new Uint8Array([255, 216, 255])), null);
  assert.equal(MAX_MENU_PHOTO_BYTES, 5 * 1024 * 1024);
});

test('photo request denies disabled and unauthenticated uploads before Storage', async () => {
  const { fake, calls } = client();
  const disabled = await handlePhotoMenuRequest({ request: request(), access: 'authorized', enabled: false, mode: 'create', client: fake });
  const denied = await handlePhotoMenuRequest({ request: request(), access: 'unauthenticated', enabled: true, mode: 'create', client: fake });
  assert.equal(disabled.status, 503); assert.equal(denied.status, 401);
  assert.deepEqual(calls, []);
});

test('photo request rejects a mismatched MIME and invalid menu before Storage', async () => {
  const { fake, calls } = client();
  const bad = await handlePhotoMenuRequest({ request: request(new File([jpeg], 'photo.png', { type: 'image/png' })), access: 'authorized', enabled: true, mode: 'create', client: fake });
  assert.equal(bad.status, 400);
  assert.deepEqual(calls, []);
});

test('photo create and edit only report success after database confirmation', async () => {
  const { fake, calls } = client();
  const create = await handlePhotoMenuRequest({ request: request(), access: 'authorized', enabled: true, mode: 'create', client: fake });
  assert.equal(create.status, 201);
  assert.equal((await create.json()).status, 'ready');
  const edit = await handlePhotoMenuRequest({ request: request(), access: 'authorized', enabled: true, mode: 'edit', id, client: fake });
  assert.equal(edit.status, 200);
  assert.equal((await edit.json()).status, 'ready');
  assert.equal(calls.filter((call) => call.startsWith('upload:')).length, 2);
  assert.equal(calls.some((call) => call.startsWith('insert:')), true);
  assert.equal(calls.some((call) => call.startsWith('update:')), true);
  const failing = client(true);
  const failed = await handlePhotoMenuRequest({ request: request(), access: 'authorized', enabled: true, mode: 'edit', id, client: failing.fake });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).status, 'unavailable');
});
