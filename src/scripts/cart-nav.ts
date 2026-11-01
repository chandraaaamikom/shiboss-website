import { cartCount } from './cart-store.ts';

const count = document.querySelector<HTMLElement>('[data-cart-count]');
function update() { if (count) count.textContent = String(cartCount()); }
update();
document.addEventListener('shiboss:cart-changed', update);
