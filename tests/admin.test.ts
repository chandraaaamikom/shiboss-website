import test from 'node:test';
import assert from 'node:assert/strict';
import { adminEnabled, isAdminProfile, isSameOriginForm, privateResponse } from '../src/lib/admin/access.ts';

test('admin routes remain disabled unless explicitly enabled', () => {
  assert.equal(adminEnabled(undefined), false);
  assert.equal(adminEnabled('false'), false);
  assert.equal(adminEnabled('TRUE'), false);
  assert.equal(adminEnabled('true'), true);
});

test('an authenticated identity is not sufficient without the matching admin profile', () => {
  assert.equal(isAdminProfile(null, 'user-a'), false);
  assert.equal(isAdminProfile({ id: 'user-a', role: 'customer', full_name: 'A' }, 'user-a'), false);
  assert.equal(isAdminProfile({ id: 'user-b', role: 'admin', full_name: 'B' }, 'user-a'), false);
  assert.equal(isAdminProfile({ id: 'user-a', role: 'admin', full_name: ' ' }, 'user-a'), false);
  assert.equal(isAdminProfile({ id: 'user-a', role: 'admin', full_name: 'A' }, 'user-a'), true);
});

test('login and logout forms require same-origin urlencoded POSTs', () => {
  const url = 'http://127.0.0.1:4321/api/admin/login';
  const headers = { Origin: 'http://127.0.0.1:4321', 'Content-Type': 'application/x-www-form-urlencoded' };
  assert.equal(isSameOriginForm(new Request(url, { method: 'POST', headers, body: 'email=a%40b.test' })), true);
  assert.equal(isSameOriginForm(new Request(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.test' }, body: 'x=1' })), false);
  assert.equal(isSameOriginForm(new Request(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })), false);
  assert.equal(isSameOriginForm(new Request(url, { method: 'POST', headers: { ...headers, 'Content-Length': '4097' }, body: 'x=1' })), false);
});

test('redirect responses retain their location and receive no-store headers', () => {
  const response = privateResponse(Response.redirect('http://127.0.0.1:4321/admin/login', 303));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'http://127.0.0.1:4321/admin/login');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
