
import { cartSummary } from '../lib/cart.ts';
import { rupiah } from '../lib/validation/menu.ts';
import type { MenuItem } from '../types/menu.ts';
import type { OrderReceipt } from '../types/order.ts';
import {
  clearOrderAttempt,
  getOrderAttempt,
  readCart,
  receiptKey,
} from './cart-store.ts';
import { currentMenu, orderLine } from './order-ui.ts';

const form = document.querySelector<HTMLFormElement>('[data-checkout-form]');
const list = document.querySelector<HTMLElement>('[data-checkout-items]');
const total = document.querySelector<HTMLElement>('[data-checkout-total]');
const feedback = document.querySelector<HTMLElement>('[data-checkout-feedback]');
const button = document.querySelector<HTMLButtonElement>('[data-submit-order]');

const ordersEnabled = form?.dataset.ordersEnabled === 'true';

let menu: MenuItem[] = [];
let submitting = false;

function render() {
  if (!list || !total || !feedback || !button) return;

  const cart = readCart();
  const summary = cartSummary(cart, menu);

  list.replaceChildren(...summary.products.map(orderLine));
  total.textContent = rupiah(summary.total);

  if (!cart.length) {
    feedback.textContent = 'Keranjang kosong. Pilih menu terlebih dahulu.';
  } else if (summary.unavailable.length) {
    feedback.textContent = 'Ada produk yang tidak tersedia. Perbarui keranjang sebelum mengirim pesanan.';
  } else if (!ordersEnabled) {
    feedback.textContent = 'Pemesanan online menunggu aktivasi kedai.';
  } else {
    feedback.textContent = '';
  }

  button.disabled =
    !ordersEnabled ||
    submitting ||
    !cart.length ||
    summary.unavailable.length > 0;
}

currentMenu().then((items) => {
  menu = items;
  render();
}).catch(() => {
  if (feedback) {
    feedback.textContent = 'Menu belum dapat dimuat. Coba muat ulang halaman.';
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form || !button || !feedback || submitting || !ordersEnabled) {
    return;
  }

  const cart = readCart();
  const summary = cartSummary(cart, menu);

  if (
    !cart.length ||
    summary.unavailable.length ||
    !Number.isFinite(summary.total) ||
    summary.total <= 0
  ) {
    render();
    return;
  }

  const name =
    form.querySelector<HTMLInputElement>('[name="customer_name"]')
      ?.value.trim() ?? '';

  const table =
    form.querySelector<HTMLInputElement>('[name="table_number"]')
      ?.value.trim() ?? '';

  const notes =
    form.querySelector<HTMLTextAreaElement>('[name="notes"]')
      ?.value.trim() ?? '';

  if (!name || !table) {
    feedback.textContent = 'Nama pelanggan dan nomor meja wajib diisi.';
    return;
  }

  submitting = true;
  button.disabled = true;
  button.textContent = 'Mengirim pesanan…';
  feedback.textContent = '';

  try {
    const attempt = getOrderAttempt();

    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_name: name,
        table_number: table,
        notes,
        items: cart.map(({ id, quantity }) => ({
          menu_item_id: id,
          quantity,
        })),
        expected_total: summary.total,
        idempotency_key: attempt.idempotency_key,
        guest_access_token: attempt.guest_access_token,
      }),
    });

    const body = await response.json() as {
      status?: string;
      receipt?: OrderReceipt;
      message?: string;
    };

    if (!response.ok || body.status !== 'ready' || !body.receipt) {
      if (response.status === 409) {
        menu = await currentMenu();
        render();

        feedback.textContent =
          body.message ??
          'Harga atau ketersediaan berubah. Periksa ringkasan terbaru sebelum mengirim ulang.';

        clearOrderAttempt();
      } else {
        feedback.textContent =
          body.message ??
          'Pesanan belum berhasil dikirim. Coba lagi.';
      }

      return;
    }

    sessionStorage.setItem(
      receiptKey,
      JSON.stringify({
        ...body.receipt,
        guest_access_token: attempt.guest_access_token,
      })
    );

    clearOrderAttempt();

    sessionStorage.removeItem('shiboss-cart-v1');

    location.assign('/order/confirmation');
  } catch (error) {
    feedback.textContent = error instanceof Error
      ? error.message
      : 'Jaringan bermasalah. Coba lagi menggunakan identitas pesanan yang sama.';
  } finally {
    submitting = false;

    button.textContent = 'Kirim pesanan';

    const latest = readCart();

    button.disabled =
      !ordersEnabled ||
      !latest.length ||
      cartSummary(latest, menu).unavailable.length > 0;
  }
});
