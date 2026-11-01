import { cartSummary, removeFromCart, setCartQuantity } from '../lib/cart.ts';
import { rupiah } from '../lib/validation/menu.ts';
import type { MenuItem } from '../types/menu.ts';
import { readCart, saveCart } from './cart-store.ts';
import { currentMenu, orderLine } from './order-ui.ts';

const list = document.querySelector<HTMLElement>('[data-cart-items]');
const total = document.querySelector<HTMLElement>('[data-cart-total]');
const feedback = document.querySelector<HTMLElement>('[data-cart-feedback]');
const checkout = document.querySelector<HTMLAnchorElement>('[data-checkout-link]');
let menu: MenuItem[] = [];

function render() {
  if (!list || !total || !checkout || !feedback) return;
  const cart = readCart();
  const summary = cartSummary(cart, menu);
  list.replaceChildren();
  if (!cart.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-state';
    empty.innerHTML = '<h2>Keranjang masih kosong</h2><p>Pilih menu yang ingin dipesan terlebih dahulu.</p><a class="button secondary" href="/menu">Lihat menu</a>';
    list.append(empty);
  }
  for (const product of summary.products) {
    const row = orderLine(product);
    const controls = document.createElement('div');
    controls.className = 'quantity-actions';
    const minus = button('Kurangi', () => change(product.item.id, product.quantity - 1));
    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.step = '1'; input.value = String(product.quantity);
    input.setAttribute('aria-label', `Jumlah ${product.item.name}`);
    input.addEventListener('change', () => change(product.item.id, Number(input.value)));
    const plus = button('Tambah', () => change(product.item.id, product.quantity + 1));
    const remove = button('Hapus', () => { saveCart(removeFromCart(readCart(), product.item.id)); render(); });
    remove.classList.add('text-button');
    controls.append(minus, input, plus, remove);
    row.lastElementChild?.append(controls);
    list.append(row);
  }
  if (summary.unavailable.length) {
    const warning = document.createElement('p');
    warning.textContent = `${summary.unavailable.length} produk dalam keranjang tidak tersedia lagi. Hapus produk tersebut sebelum checkout.`;
    list.append(warning);
    for (const id of summary.unavailable) list.append(button('Hapus produk tidak tersedia', () => { saveCart(removeFromCart(readCart(), id)); render(); }));
  }
  total.textContent = rupiah(summary.total);
  checkout.setAttribute('aria-disabled', String(!cart.length || summary.unavailable.length > 0));
}

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button'; element.className = 'button secondary'; element.textContent = label;
  element.addEventListener('click', action);
  return element;
}

function change(id: string, quantity: number) {
  if (!feedback) return;
  try {
    saveCart(setCartQuantity(readCart(), id, quantity));
    feedback.textContent = '';
    render();
  } catch { feedback.textContent = 'Jumlah harus berupa bilangan bulat positif. Gunakan Hapus untuk mengeluarkan produk.'; render(); }
}

checkout?.addEventListener('click', (event) => {
  if (checkout.getAttribute('aria-disabled') === 'true') event.preventDefault();
});

currentMenu().then((items) => { menu = items; render(); }).catch(() => {
  if (list) list.textContent = 'Menu belum berhasil dimuat. Muat ulang halaman untuk mencoba lagi.';
  if (feedback) feedback.textContent = 'Keranjang belum dapat diperiksa.';
});
