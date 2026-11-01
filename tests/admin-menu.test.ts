import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMenuWriteInput, processMenuMutation, type MenuWriteInput, type MenuWritePort } from '../src/lib/admin/menu-mutations.ts';
import { handleMenuWriteRequest } from '../src/lib/admin/menu-request.ts';
import { MENU_CATEGORIES } from '../src/lib/admin/menu-categories.ts';
import { readFileSync } from 'node:fs';

const id = '00000000-0000-4000-8000-000000000101';
const valid = { name: 'Susu Segar', category: 'Special Susu', description: null, price: 12000, is_available: true };
function port(result: { id?: string; error?: boolean } = { id }): MenuWritePort {
  return { insert: async () => result, update: async () => result };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:4321/api/admin/menu', {
    method: 'POST', headers: { Origin: 'http://127.0.0.1:4321', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('menu write input accepts required fields and rejects tampering and invalid values', () => {
  assert.deepEqual(parseMenuWriteInput(valid), valid);
  assert.equal(parseMenuWriteInput({ ...valid, name: '  ' }), null);
  assert.equal(parseMenuWriteInput({ ...valid, category: '' }), null);
  assert.equal(parseMenuWriteInput({ ...valid, price: 0 }), null);
  assert.equal(parseMenuWriteInput({ ...valid, price: -100 }), null);
  assert.equal(parseMenuWriteInput({ ...valid, price: 1.234 }), null);
  assert.equal(parseMenuWriteInput({ ...valid, price: 10_000_000_000 }), null);
  assert.equal(parseMenuWriteInput({ ...valid, is_available: 'true' }), null);
  assert.equal(parseMenuWriteInput({ ...valid, role: 'admin' }), null);
  assert.equal(parseMenuWriteInput({ ...valid, image_url: 'https://example.test/photo.png' }), null);
});

test('category choices match the admin form and only catalog categories pass server validation', () => {
  assert.deepEqual(MENU_CATEGORIES, ['Food', 'Milkshake', 'Minuman Lainnya', 'Snack', 'Special Susu', 'Tambahan', 'Varian Telur']);
  for (const category of MENU_CATEGORIES) assert.equal(parseMenuWriteInput({ ...valid, category })?.category, category);
  for (const category of ['Minuman', 'special susu', 'Lainnya']) assert.equal(parseMenuWriteInput({ ...valid, category }), null);
  const form = readFileSync(new URL('../src/components/AdminMenuForm.astro', import.meta.url), 'utf8');
  assert.match(form, /<select name="category" required>/);
  assert.match(form, /Pilih kategori/);
  assert.match(form, /MENU_CATEGORIES\.map/);
  assert.match(form, /selected=\{item\?\.category === category\}/);
});

test('price must be a safe positive multiple of Rp1.000', () => {
  for (const price of [7000, 8000, 10000, 15000]) assert.equal(parseMenuWriteInput({ ...valid, price })?.price, price);
  for (const price of [10000.07, 10500, 12300, 0, -1000, 1e16]) assert.equal(parseMenuWriteInput({ ...valid, price }), null);
  const form = readFileSync(new URL('../src/components/AdminMenuForm.astro', import.meta.url), 'utf8');
  assert.match(form, /min="1000" step="1000"/);
});

test('disabled flag and non-admin identities cannot call the database port', async () => {
  let called = false;
  const guarded: MenuWritePort = {
    insert: async () => { called = true; return { id }; },
    update: async () => { called = true; return { id }; },
  };
  for (const access of ['unauthenticated', 'forbidden', 'unavailable'] as const) {
    const result = await processMenuMutation({ enabled: true, access, mode: 'create', input: valid, port: guarded });
    assert.notEqual(result.status, 'ready');
  }
  const disabled = await processMenuMutation({ enabled: false, access: 'authorized', mode: 'create', input: valid, port: guarded });
  assert.equal(disabled.status, 'unavailable');
  assert.equal(called, false);
});

test('create and edit pass only validated fields and preserve availability', async () => {
  const calls: Array<{ method: string; id?: string; input: MenuWriteInput }> = [];
  const adapter: MenuWritePort = {
    insert: async (input) => { calls.push({ method: 'insert', input }); return { id }; },
    update: async (key, input) => { calls.push({ method: 'update', id: key, input }); return { id: key }; },
  };
  assert.equal((await processMenuMutation({ enabled: true, access: 'authorized', mode: 'create', input: valid, port: adapter })).status, 'ready');
  const unavailable = { ...valid, is_available: false };
  assert.equal((await processMenuMutation({ enabled: true, access: 'authorized', mode: 'edit', id, input: unavailable, port: adapter })).status, 'ready');
  assert.deepEqual(calls, [{ method: 'insert', input: valid }, { method: 'update', id, input: unavailable }]);
});

test('invalid ID, missing row, and backend failure never report success', async () => {
  assert.equal((await processMenuMutation({ enabled: true, access: 'authorized', mode: 'edit', id: 'bad', input: valid, port: port() })).status, 'invalid');
  assert.equal((await processMenuMutation({ enabled: true, access: 'authorized', mode: 'edit', id, input: valid, port: port({}) })).status, 'not_found');
  assert.equal((await processMenuMutation({ enabled: true, access: 'authorized', mode: 'create', input: valid, port: port({ error: true }) })).status, 'unavailable');
  const throwing: MenuWritePort = { insert: async () => { throw new Error('secret'); }, update: async () => { throw new Error('secret'); } };
  const result = await processMenuMutation({ enabled: true, access: 'authorized', mode: 'create', input: valid, port: throwing });
  assert.equal(result.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('API request rejects cross-origin, wrong media type, and disabled writes', async () => {
  const denied = await handleMenuWriteRequest({ request: request(valid, { Origin: 'https://other.test' }), enabled: true, access: 'authorized', mode: 'create', port: port() });
  assert.equal(denied.status, 403);
  const disabled = await handleMenuWriteRequest({ request: request(valid), enabled: false, access: 'authorized', mode: 'create', port: port() });
  assert.equal(disabled.status, 503);
  const unauth = await handleMenuWriteRequest({ request: request(valid), enabled: true, access: 'unauthenticated', mode: 'create', port: port() });
  assert.equal(unauth.status, 401);
  const wrongType = await handleMenuWriteRequest({ request: request(valid, { 'Content-Type': 'text/plain' }), enabled: true, access: 'authorized', mode: 'create', port: port() });
  assert.equal(wrongType.status, 415);
});

test('API reports a successful local adapter result without exposing internal data', async () => {
  const response = await handleMenuWriteRequest({ request: request(valid), enabled: true, access: 'authorized', mode: 'create', port: port() });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { status: 'ready', message: 'Menu berhasil ditambahkan.', id });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('API create and edit return success only after the adapter confirms a row', async () => {
  const create = await handleMenuWriteRequest({ request: request(valid), enabled: true, access: 'authorized', mode: 'create', port: port() });
  assert.equal(create.status, 201);
  const edit = await handleMenuWriteRequest({ request: request(valid), enabled: true, access: 'authorized', mode: 'edit', id, port: port() });
  assert.equal(edit.status, 200);
  assert.equal((await edit.json()).status, 'ready');
  const missing = await handleMenuWriteRequest({ request: request(valid), enabled: true, access: 'authorized', mode: 'edit', id, port: port({}) });
  assert.equal(missing.status, 404);
  const invalid = await handleMenuWriteRequest({ request: request({ ...valid, price: 10500 }), enabled: true, access: 'authorized', mode: 'create', port: port() });
  assert.equal(invalid.status, 400);
});
