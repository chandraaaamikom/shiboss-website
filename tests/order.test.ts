import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToCart, cartSummary, parseCart, removeFromCart, setCartQuantity } from '../src/lib/cart.ts';
import { createOrderFrom, validateOrderDraft } from '../src/lib/services/order-core.ts';
import type { MenuItem } from '../src/types/menu.ts';

const id = '00000000-0000-4000-8000-000000000001';
const key = '00000000-0000-4000-8000-000000000002';
const menu: MenuItem = { id, name: 'Menu terverifikasi', category: 'Uji', description: null, price: 12345.5, image_url: null, is_available: true };
const draft = { customer_name: '  Dinda  ', table_number: ' 7 ', notes: '', items: [{ menu_item_id: id, quantity: 2 }], expected_total: 24691, idempotency_key: key };
const receipt = { order_number: 'SHB-00000000000040008000000000000003', order_status: 'pending', payment_status: 'pending', payment_method: 'qris', total_amount: 24691, items: [{ product_name: menu.name, quantity: 2, unit_price: 12345.5, subtotal: 24691 }] };
const deps = { url: 'https://example.supabase.co', key: 'sb_publishable_test-value' };

test('cart adds, updates, removes, and calculates from menu prices', () => {
  let cart = addToCart([], id, 1);
  cart = addToCart(cart, id, 2);
  assert.deepEqual(cart, [{ id, quantity: 3 }]);
  assert.equal(cartSummary(cart, [menu]).total, 37036.5);
  cart = setCartQuantity(cart, id, 2);
  assert.equal(cartSummary(cart, [menu]).products[0]?.subtotal, 24691);
  assert.deepEqual(removeFromCart(cart, id), []);
});

test('cart rejects invalid quantities and unavailable products', () => {
  assert.throws(() => addToCart([], id, 0));
  assert.throws(() => setCartQuantity([{ id, quantity: 1 }], id, -1));
  assert.deepEqual(parseCart([{ id, quantity: 1 }, { id, quantity: 2 }, { id: 'bad', quantity: 1 }]), [{ id, quantity: 1 }]);
  assert.deepEqual(cartSummary([{ id, quantity: 1 }], [{ ...menu, is_available: false }]).unavailable, [id]);
});

test('checkout requires name, table, items, positive integer quantities, and rejects browser prices', () => {
  assert.equal(validateOrderDraft(draft).customer_name, 'Dinda');
  assert.equal(validateOrderDraft(draft).table_number, '7');
  for (const input of [
    { ...draft, customer_name: '' }, { ...draft, table_number: ' ' }, { ...draft, items: [] },
    { ...draft, items: [{ menu_item_id: id, quantity: 0 }] },
    { ...draft, items: [{ menu_item_id: id, quantity: 1.5 }] },
    { ...draft, price: 1 }, { ...draft, total_amount: 1 },
    { ...draft, items: [{ menu_item_id: id, quantity: 2, unit_price: 1 }] },
  ]) assert.throws(() => validateOrderDraft(input));
});

test('server passes only IDs and quantities to the atomic RPC with publishable apikey', async () => {
  let payload: Record<string, unknown> | undefined;
  let headers: Headers | undefined;
  const outcome = await createOrderFrom(draft, { ...deps, fetcher: async (_url, init) => {
    payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    headers = new Headers(init.headers);
    return { ok: true, status: 200, json: async () => receipt };
  } });
  assert.equal(outcome.status, 'ready');
  assert.deepEqual(payload?.p_items, [{ menu_item_id: id, quantity: 2 }]);
  assert.equal(payload?.p_expected_total, 24691);
  assert.equal(payload?.p_idempotency_key, key);
  assert.equal(headers?.has('authorization'), false);
  assert.equal(headers?.get('apikey'), deps.key);
});

test('same idempotency key is sent again on a retry', async () => {
  const keys: unknown[] = [];
  const fetcher = async (_url: URL, init: RequestInit) => {
    keys.push((JSON.parse(String(init.body)) as Record<string, unknown>).p_idempotency_key);
    return { ok: true, status: 200, json: async () => receipt };
  };
  await createOrderFrom(draft, { ...deps, fetcher });
  await createOrderFrom(draft, { ...deps, fetcher });
  assert.deepEqual(keys, [key, key]);
});

test('replay accepts the saved receipt after an admin status change', async () => {
  const updated = { ...receipt, order_status: 'confirmed', payment_status: 'paid' };
  const result = await createOrderFrom(draft, { ...deps, fetcher: async () => ({ ok: true, status: 200, json: async () => updated }) });
  assert.equal(result.status, 'ready');
  if (result.status === 'ready') {
    assert.equal(result.receipt.order_status, 'confirmed');
    assert.equal(result.receipt.payment_status, 'paid');
  }
});

test('conflicting idempotency key never produces another success receipt', async () => {
  const result = await createOrderFrom(draft, { ...deps, fetcher: async () => ({
    ok: false, status: 400, json: async () => ({ code: 'P0001', message: 'IDEMPOTENCY_CONFLICT' }),
  }) });
  assert.equal(result.status, 'invalid');
  assert.match(result.message, /staf kedai/);
});

test('checkout rejects duplicate lines, invalid table data, and oversized quantities', () => {
  for (const input of [
    { ...draft, table_number: 'x'.repeat(31) },
    { ...draft, items: [draft.items[0], draft.items[0]] },
    { ...draft, items: [{ menu_item_id: id, quantity: 2147483648 }] },
    { ...draft, notes: 'x'.repeat(501) },
    { ...draft, expected_total: -1 },
  ]) assert.throws(() => validateOrderDraft(input));
});

test('tampered expected total is forwarded only for database comparison, never as item price', async () => {
  let payload: Record<string, unknown> | undefined;
  const altered = { ...draft, expected_total: 1 };
  const result = await createOrderFrom(altered, { ...deps, fetcher: async (_url, init) => {
    payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    return { ok: false, status: 400, json: async () => ({ code: 'P0001', message: 'PRICE_CHANGED' }) };
  } });
  assert.equal(result.status, 'changed');
  assert.deepEqual(payload?.p_items, draft.items);
  assert.equal(payload?.p_expected_total, 1);
  assert.equal(Object.hasOwn(payload ?? {}, 'unit_price'), false);
});

test('price or availability changes are rejected without a success receipt', async () => {
  for (const code of ['PRICE_CHANGED', 'MENU_UNAVAILABLE']) {
    const result = await createOrderFrom(draft, { ...deps, fetcher: async () => ({ ok: false, status: 400, json: async () => ({ code: 'P0001', message: code }) }) });
    assert.equal(result.status, 'changed');
  }
});

test('database and network failures never produce a success confirmation', async () => {
  const network = await createOrderFrom(draft, { ...deps, fetcher: async () => { throw new Error('not exposed'); } });
  const missing = await createOrderFrom(draft, { ...deps, fetcher: async () => ({ ok: false, status: 404, json: async () => ({ code: 'PGRST202' }) }) });
  const partial = await createOrderFrom(draft, { ...deps, fetcher: async () => ({ ok: true, status: 200, json: async () => ({ order_number: receipt.order_number }) }) });
  assert.equal(network.status, 'error');
  assert.equal(missing.status, 'unavailable');
  assert.equal(partial.status, 'error');
});
