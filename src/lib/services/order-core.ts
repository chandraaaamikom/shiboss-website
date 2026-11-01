
import { createHash } from 'node:crypto';
import type { OrderReceipt } from '../../types/order.ts';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;

const allowedKeys = new Set([
  'customer_name',
  'table_number',
  'notes',
  'items',
  'expected_total',
  'idempotency_key',
  'guest_access_token',
]);

type Fetcher = (
  input: URL,
  init: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export interface OrderDraft {
  customer_name: string;
  table_number: string;
  notes: string | null;
  items: { menu_item_id: string; quantity: number }[];
  expected_total: number;
  idempotency_key: string;
  guest_access_token: string;
}

export type OrderOutcome =
  | { status: 'ready'; receipt: OrderReceipt }
  | { status: 'invalid' | 'changed' | 'unavailable' | 'error'; message: string };

export function validateOrderDraft(raw: unknown): OrderDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid');
  }

  const input = raw as Record<string, unknown>;

  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error('invalid');
  }

  const name =
    typeof input.customer_name === 'string'
      ? input.customer_name.trim()
      : '';

  const table =
    typeof input.table_number === 'string'
      ? input.table_number.trim()
      : '';

  const notes =
    typeof input.notes === 'string'
      ? input.notes.trim()
      : input.notes == null
        ? ''
        : null;

  const total = input.expected_total;

  if (
    !name ||
    name.length > 100 ||
    !table ||
    table.length > 30 ||
    notes === null ||
    notes.length > 500 ||
    typeof total !== 'number' ||
    !Number.isFinite(total) ||
    total <= 0 ||
    Math.abs(total * 100 - Math.round(total * 100)) > 0.000001 ||
    typeof input.idempotency_key !== 'string' ||
    !uuid.test(input.idempotency_key) ||
    typeof input.guest_access_token !== 'string' ||
    !tokenPattern.test(input.guest_access_token) ||
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 50
  ) {
    throw new Error('invalid');
  }

  const seen = new Set<string>();

  const items = input.items.map((value): OrderDraft['items'][number] => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'menu_item_id,quantity'
    ) {
      throw new Error('invalid');
    }

    const line = value as Record<string, unknown>;

    if (
      typeof line.menu_item_id !== 'string' ||
      !uuid.test(line.menu_item_id) ||
      typeof line.quantity !== 'number' ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 2147483647 ||
      seen.has(line.menu_item_id)
    ) {
      throw new Error('invalid');
    }

    seen.add(line.menu_item_id);

    return {
      menu_item_id: line.menu_item_id,
      quantity: line.quantity,
    };
  });

  return {
    customer_name: name,
    table_number: table,
    notes: notes || null,
    items,
    expected_total: total,
    idempotency_key: input.idempotency_key,
    guest_access_token: input.guest_access_token,
  };
}

function validReceipt(value: unknown): value is OrderReceipt {
  if (!value || typeof value !== 'object') return false;

  const receipt = value as Partial<OrderReceipt>;

  return (
    typeof receipt.order_number === 'string' &&
    /^SHB-[0-9a-f]{32}$/.test(receipt.order_number) &&
    ['pending', 'confirmed', 'cancelled'].includes(
      receipt.order_status ?? ''
    ) &&
    ['pending', 'paid', 'rejected'].includes(
      receipt.payment_status ?? ''
    ) &&
    receipt.payment_method === 'qris' &&
    typeof receipt.total_amount === 'number' &&
    receipt.total_amount > 0 &&
    Array.isArray(receipt.items) &&
    receipt.items.length > 0 &&
    receipt.items.every((item) =>
      typeof item.product_name === 'string' &&
      item.product_name.length > 0 &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0 &&
      typeof item.unit_price === 'number' &&
      item.unit_price > 0 &&
      typeof item.subtotal === 'number' &&
      Math.round(item.subtotal * 100) ===
        Math.round(item.unit_price * 100) * item.quantity
    ) &&
    receipt.items.reduce(
      (sum, item) => sum + Math.round(item.subtotal * 100),
      0
    ) === Math.round(receipt.total_amount * 100)
  );
}

export async function createOrderFrom(
  raw: unknown,
  deps: { url?: string; key?: string; fetcher?: Fetcher }
): Promise<OrderOutcome> {
  let draft: OrderDraft;

  try {
    draft = validateOrderDraft(raw);
  } catch {
    return {
      status: 'invalid',
      message: 'Periksa nama, nomor meja, jumlah, dan isi keranjang.',
    };
  }

  if (
    !deps.url ||
    !deps.key ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(deps.key)
  ) {
    return {
      status: 'error',
      message: 'Pemesanan belum tersedia. Silakan hubungi staf kedai.',
    };
  }

  let endpoint: URL;

  try {
    endpoint = new URL('/rest/v1/rpc/create_table_order', deps.url);

    if (endpoint.protocol !== 'https:') {
      throw new Error('invalid');
    }
  } catch {
    return {
      status: 'error',
      message: 'Pemesanan belum tersedia. Silakan hubungi staf kedai.',
    };
  }

  const tokenHash = createHash('sha256')
    .update(draft.guest_access_token, 'utf8')
    .digest('hex');

  let response: Pick<Response, 'ok' | 'status' | 'json'>;

  try {
    response = await (deps.fetcher ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        apikey: deps.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_customer_name: draft.customer_name,
        p_table_number: draft.table_number,
        p_notes: draft.notes,
        p_items: draft.items,
        p_expected_total: draft.expected_total,
        p_idempotency_key: draft.idempotency_key,
        p_guest_access_token_hash: tokenHash,
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return {
      status: 'error',
      message: 'Jaringan bermasalah. Coba kirim ulang pesanan.',
    };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return {
      status: 'error',
      message: 'Pesanan belum dapat disimpan.',
    };
  }

  if (!response.ok) {
    const error =
      body && typeof body === 'object'
        ? body as Record<string, unknown>
        : {};

    if (
      error.code === 'P0001' &&
      (error.message === 'PRICE_CHANGED' ||
        error.message === 'MENU_UNAVAILABLE')
    ) {
      return {
        status: 'changed',
        message: 'Harga atau ketersediaan menu berubah. Periksa kembali ringkasan pesanan.',
      };
    }

    if (
      error.code === 'P0001' &&
      error.message === 'IDEMPOTENCY_CONFLICT'
    ) {
      return {
        status: 'invalid',
        message: 'Identitas permintaan sudah digunakan untuk pesanan berbeda. Hubungi staf kedai.',
      };
    }

    if (
      error.code === 'P0001' &&
      error.message === 'GUEST_ACCESS_TOKEN_MISMATCH'
    ) {
      return {
        status: 'invalid',
        message: 'Token akses tidak cocok dengan pesanan sebelumnya. Hubungi staf kedai.',
      };
    }

    if (error.code === '22023' || error.code === '22P02') {
      return {
        status: 'invalid',
        message: 'Data pesanan tidak valid.',
      };
    }

    return {
      status: 'unavailable',
      message: 'Pemesanan belum tersedia. Silakan hubungi staf kedai.',
    };
  }

  if (!validReceipt(body)) {
    return {
      status: 'error',
      message: 'Konfirmasi pesanan belum dapat diverifikasi. Hubungi staf kedai.',
    };
  }

  return { status: 'ready', receipt: body };
}
