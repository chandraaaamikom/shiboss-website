import type { MenuItem } from '../types/menu.ts';

export interface CartLine { id: string; quantity: number }
export interface CartProduct { item: MenuItem; quantity: number; subtotal: number }
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function validQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((line): line is CartLine => {
    if (!line || typeof line !== 'object') return false;
    const { id, quantity } = line as Partial<CartLine>;
    if (typeof id !== 'string' || !uuid.test(id) || !validQuantity(quantity) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function addToCart(cart: CartLine[], id: string, quantity: number): CartLine[] {
  if (!uuid.test(id) || !validQuantity(quantity)) throw new Error('Jumlah pesanan tidak valid.');
  const current = cart.find((line) => line.id === id);
  if (!current) return [...cart, { id, quantity }];
  const next = current.quantity + quantity;
  if (!validQuantity(next)) throw new Error('Jumlah pesanan tidak valid.');
  return cart.map((line) => line.id === id ? { id, quantity: next } : line);
}

export function setCartQuantity(cart: CartLine[], id: string, quantity: number): CartLine[] {
  if (!validQuantity(quantity)) throw new Error('Jumlah pesanan tidak valid.');
  return cart.map((line) => line.id === id ? { id, quantity } : line);
}

export function removeFromCart(cart: CartLine[], id: string): CartLine[] {
  return cart.filter((line) => line.id !== id);
}

export function cartSummary(cart: CartLine[], menu: MenuItem[]) {
  const byId = new Map(menu.map((item) => [item.id, item]));
  const products: CartProduct[] = [];
  const unavailable: string[] = [];
  for (const line of cart) {
    const item = byId.get(line.id);
    if (!item || !item.is_available || !validQuantity(line.quantity)) {
      unavailable.push(line.id);
      continue;
    }
    products.push({ item, quantity: line.quantity, subtotal: item.price * line.quantity });
  }
  return { products, unavailable, total: products.reduce((sum, line) => sum + line.subtotal, 0) };
}
