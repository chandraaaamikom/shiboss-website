import type { MenuItem, MenuResult } from '../types/menu.ts';
import { rupiah } from '../lib/validation/menu.ts';
import type { CartProduct } from '../lib/cart.ts';

export async function currentMenu(): Promise<MenuItem[]> {
  const response = await fetch('/api/menu', { cache: 'no-store' });
  if (!response.ok) throw new Error('Menu belum dapat dimuat. Coba lagi nanti.');
  const result = await response.json() as MenuResult;
  if (result.status !== 'ready' || !Array.isArray(result.items)) throw new Error('Menu belum dapat dimuat. Coba lagi nanti.');
  return result.items;
}

export function orderLine(product: CartProduct): HTMLElement {
  const row = document.createElement('article');
  row.className = 'order-line';
  const media = document.createElement('div');
  media.className = 'product-media order-line-media';
  if (product.item.image_url) {
    const image = document.createElement('img');
    image.src = product.item.image_url;
    image.alt = product.item.name;
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.replaceWith(placeholder()); }, { once: true });
    media.append(image);
    if (image.complete && image.naturalWidth === 0) image.replaceWith(placeholder());
  } else media.append(placeholder());
  const description = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = product.item.name;
  const unit = document.createElement('p');
  unit.textContent = `${rupiah(product.item.price)} × ${product.quantity}`;
  const subtotal = document.createElement('strong');
  subtotal.textContent = rupiah(product.subtotal);
  description.append(title, unit, subtotal);
  row.append(media, description);
  return row;
}

function placeholder(): HTMLElement {
  const span = document.createElement('span');
  span.textContent = 'Foto produk belum tersedia';
  return span;
}
