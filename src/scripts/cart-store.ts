
import { parseCart, type CartLine } from '../lib/cart.ts';

const cartKey = 'shiboss-cart-v1';
export const orderKey = 'shiboss-order-attempt-v1';
export const receiptKey = 'shiboss-order-receipt-v1';
export const guestAccessTokenKey = 'shiboss-guest-access-token-v1';

const attemptStorageKey = 'shiboss-order-attempt-v2';

export interface OrderAttempt {
  idempotency_key: string;
  guest_access_token: string;
}

const uuidPattern =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const tokenPattern = /^[0-9a-f]{64}$/;

export function readCart(): CartLine[] {
  try {
    return parseCart(
      JSON.parse(sessionStorage.getItem(cartKey) ?? '[]')
    );
  } catch {
    return [];
  }
}

export function saveCart(cart: CartLine[]): void {
  sessionStorage.setItem(cartKey, JSON.stringify(cart));

  // Keep an in-flight attempt across cart edits.
  document.dispatchEvent(new Event('shiboss:cart-changed'));
}

export function getOrderAttempt(): OrderAttempt {
  const stored = sessionStorage.getItem(attemptStorageKey);

  if (stored) {
    try {
      const attempt = JSON.parse(stored) as OrderAttempt;

      if (
        uuidPattern.test(attempt.idempotency_key) &&
        tokenPattern.test(attempt.guest_access_token)
      ) {
        return attempt;
      }
    } catch {
      // Invalid stored attempt.
    }

    throw new Error(
      'Identitas pesanan tidak valid. Hubungi staf kedai sebelum mencoba kembali.'
    );
  }

  // Legacy attempt without a matching guest token.
  if (sessionStorage.getItem(orderKey)) {
    throw new Error(
      'Percobaan pesanan lama masih tersimpan. Pastikan status pesanan terlebih dahulu.'
    );
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(32));

  const guestAccessToken = Array.from(randomBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const attempt: OrderAttempt = {
    idempotency_key: crypto.randomUUID(),
    guest_access_token: guestAccessToken,
  };

  sessionStorage.setItem(
    attemptStorageKey,
    JSON.stringify(attempt)
  );

  return attempt;
}

export function clearOrderAttempt(): void {
  sessionStorage.removeItem(attemptStorageKey);
  sessionStorage.removeItem(orderKey);
}

export function saveReceipt(receipt: unknown): void {
  sessionStorage.setItem(receiptKey, JSON.stringify(receipt));
}

export function cartCount(): number {
  return readCart().reduce(
    (sum, line) => sum + line.quantity,
    0
  );
}
