import { addToCart } from '../lib/cart.ts';
import { readCart, saveCart } from './cart-store.ts';

const form = document.querySelector<HTMLFormElement>('[data-add-to-cart]');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = form.querySelector<HTMLInputElement>('[name="quantity"]');
  const feedback = form.querySelector<HTMLElement>('[data-add-feedback]');
  if (!input || !feedback) return;
  try {
    const quantity = Number(input.value);
    const id = form.dataset.productId ?? '';
    saveCart(addToCart(readCart(), id, quantity));
    feedback.innerHTML = 'Ditambahkan. <a href="/cart">Lihat keranjang</a>';
  } catch {
    feedback.textContent = 'Masukkan jumlah berupa bilangan bulat positif.';
  }
});
