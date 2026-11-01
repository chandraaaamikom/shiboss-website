import { cartSummary } from '../lib/cart.ts';
import { rupiah } from '../lib/validation/menu.ts';
import type { MenuItem } from '../types/menu.ts';
import { cartCount, readCart } from './cart-store.ts';
import { currentMenu } from './order-ui.ts';

const bar = document.querySelector<HTMLElement>('[data-floating-cart]');
const count = bar?.querySelector<HTMLElement>('[data-floating-count]');
const total = bar?.querySelector<HTMLElement>('[data-floating-total]');
let menu: MenuItem[] | null = null;

function render() {
  if (!bar || !count || !total) return;
  const quantity = cartCount();
  bar.hidden = quantity === 0;
  if (!quantity) return;
  count.textContent = `${quantity} item dalam keranjang`;
  if (menu) {
    const summary = cartSummary(readCart(), menu);
    total.textContent = summary.unavailable.length ? 'Periksa ketersediaan' : `${rupiah(summary.total)} sementara`;
  } else total.textContent = 'Periksa total di keranjang';
}

if (bar) {
  render();
  if (cartCount()) currentMenu().then((items) => { menu = items; render(); }).catch(() => { /* Count stays available. */ });
  document.addEventListener('shiboss:cart-changed', () => {
    if (!menu && cartCount()) currentMenu().then((items) => { menu = items; render(); }).catch(() => { /* Keep safe fallback. */ });
    render();
  });
}
