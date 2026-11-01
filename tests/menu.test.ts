import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadMenuFrom,
  type MenuDiagnostic,
  type MenuLogger,
} from '../src/lib/services/menu-core.ts';
import { parseMenu, safeImageUrl, rupiah } from '../src/lib/validation/menu.ts';
import { localMenuImageFor } from '../src/lib/services/menu-images.ts';
import { existsSync } from 'node:fs';

const fixture={id:'00000000-0000-4000-8000-000000000001',name:'Fixture uji',category:'Kategori uji',price:12345.5,description:null,image_url:null,is_available:true};
const testPublishableKey = 'sb_publishable_test-value';
const silentLogger: MenuLogger = { error() {} };

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function diagnosticRecorder() {
  const diagnostics: MenuDiagnostic[] = [];
  const logger: MenuLogger = { error: (diagnostic) => diagnostics.push(diagnostic) };
  return { diagnostics, logger };
}

test('filters unavailable products and extra fields',()=>{const rows=parseMenu([{...fixture,internal_note:'private'},{...fixture,is_available:false}]);assert.equal(rows.length,1);assert.equal('internal_note'in rows[0],false)});
test('rejects malformed values',()=>{for(const price of[0,-1,NaN,Infinity,'12000'])assert.throws(()=>parseMenu([{...fixture,price}]));assert.throws(()=>parseMenu({error:'database error'}));assert.deepEqual(parseMenu([]),[])});
test('blocks unsafe image schemes and local paths',()=>{for(const url of['javascript:alert(1)','data:text/html,hello','//evil.test/x','http://example.com/x','/images/../private.png','/images/photo.svg','https://user:pass@example.com/photo.png'])assert.equal(safeImageUrl(url),null);assert.equal(safeImageUrl('/images/product.webp'),'/images/product.webp')});
test('formats Rupiah',()=>assert.match(rupiah(12345.5),/12\.345,5/));

test('reports unconfigured when credentials are absent', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  assert.deepEqual(await loadMenuFrom({ url: '', key: '', logger }), { status: 'unconfigured', items: [] });
  assert.deepEqual(diagnostics, ['configuration_unavailable']);
});

test('rejects a malformed publishable key before making a request', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  let requested = false;
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: 'sb_publishable_invalid value',
    fetcher: async () => {
      requested = true;
      return response(200, []);
    },
    logger,
  });
  assert.deepEqual(result, { status: 'error', items: [] });
  assert.equal(requested, false);
  assert.deepEqual(diagnostics, ['configuration_invalid']);
});

test('accepts an empty menu response', async () => {
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(200, []),
    logger: silentLogger,
  });
  assert.deepEqual(result, { status: 'ready', items: [] });
});

test('uses an exact local photo match when Supabase has no image', async () => {
  const id = 'fb1d3036-f3d8-4dcb-ba01-7227a4a65435';
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(200, [{ ...fixture, id, image_url: null }]),
    logger: silentLogger,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.items[0]?.image_url, '/images/products/french-fries.png');
  assert.equal(existsSync(`public${result.items[0]?.image_url}`), true);
  assert.equal(localMenuImageFor(fixture.id), null);
});

test('keeps a valid Supabase image ahead of the local fallback', async () => {
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(200, [{
      ...fixture,
      id: 'fb1d3036-f3d8-4dcb-ba01-7227a4a65435',
      image_url: 'https://example.supabase.co/storage/v1/object/public/menu/fries.png',
    }]),
    logger: silentLogger,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.items[0]?.image_url, 'https://example.supabase.co/storage/v1/object/public/menu/fries.png');
});

test('uses the local photo when the Supabase URL is unsafe', async () => {
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(200, [{ ...fixture, id: 'fb1d3036-f3d8-4dcb-ba01-7227a4a65435', image_url: 'javascript:alert(1)' }]),
    logger: silentLogger,
  });
  assert.equal(result.items[0]?.image_url, '/images/products/french-fries.png');
});

test('sends a publishable key only through the apikey header', async () => {
  let requestHeaders: Headers | undefined;
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async (_input, init) => {
      requestHeaders = new Headers(init.headers);
      return response(200, []);
    },
    logger: silentLogger,
  });

  assert.equal(result.status, 'ready');
  assert.equal(requestHeaders?.get('apikey'), testPublishableKey);
  assert.equal(requestHeaders?.has('authorization'), false);
});

test('classifies HTTP authentication failures without exposing response details', async () => {
  for (const [status, expected] of [[401, 'http_unauthorized'], [403, 'http_forbidden']] as const) {
    const { diagnostics, logger } = diagnosticRecorder();
    const result = await loadMenuFrom({
      url: 'https://example.supabase.co',
      key: testPublishableKey,
      fetcher: async () => response(status, { message: 'sensitive detail' }),
      logger,
    });
    assert.deepEqual(result, { status: 'error', items: [] });
    assert.deepEqual(diagnostics, [expected]);
  }
});

test('classifies a missing menu_items table from PGRST205', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(404, { code: 'PGRST205', message: 'not logged' }),
    logger,
  });
  assert.deepEqual(result, { status: 'error', items: [] });
  assert.deepEqual(diagnostics, ['table_not_found']);
});

test('classifies network failures', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => { throw new TypeError('network detail must not be logged'); },
    logger,
  });
  assert.deepEqual(result, { status: 'error', items: [] });
  assert.deepEqual(diagnostics, ['network_error']);
});

test('classifies other upstream HTTP failures', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(500, { code: 'PGRST000', message: 'not logged' }),
    logger,
  });
  assert.deepEqual(result, { status: 'error', items: [] });
  assert.deepEqual(diagnostics, ['upstream_http_error']);
});

test('classifies invalid JSON responses', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('response detail must not be logged'); },
    }),
    logger,
  });
  assert.deepEqual(result, { status: 'error', items: [] });
  assert.deepEqual(diagnostics, ['response_invalid_json']);
});

test('rejects invalid database rows as an integration error', async () => {
  const { diagnostics, logger } = diagnosticRecorder();
  const result = await loadMenuFrom({
    url: 'https://example.supabase.co',
    key: testPublishableKey,
    fetcher: async () => response(200, [{ ...fixture, price: 0 }]),
    logger,
  });
  assert.deepEqual(result, { status: 'error', items: [] });
  assert.deepEqual(diagnostics, ['response_invalid_data']);
});
