import { addToCart } from '../lib/cart.ts';
import { readCart, saveCart } from './cart-store.ts';

const form = document.querySelector<HTMLFormElement>('[data-filters]');
const search = document.querySelector<HTMLInputElement>('#search');
const category = document.querySelector<HTMLSelectElement>('#category');
const sort = document.querySelector<HTMLSelectElement>('#sort');
const tabs = document.querySelector<HTMLElement>('[data-category-tabs]');
const grid = document.querySelector<HTMLElement>('[data-product-grid]');
const cards = [...document.querySelectorAll<HTMLElement>('.product-card')];
const count = document.querySelector<HTMLElement>('#result-count');
const empty = document.querySelector<HTMLElement>('#no-results');

if (form && search && category && sort && grid && count && empty) {
  form.hidden = false;
  if (tabs) tabs.hidden = false;
  const requestedCategory = new URLSearchParams(location.search).get('category');
  if (requestedCategory && [...category.options].some((option) => option.value === requestedCategory)) category.value = requestedCategory;

  const update = () => {
    const query = search.value.trim().toLocaleLowerCase('id-ID');
    let visible = 0;
    const ordered = [...cards].sort((a, b) => {
      if (sort.value === 'price-asc') return Number(a.dataset.price) - Number(b.dataset.price) || (a.dataset.name ?? '').localeCompare(b.dataset.name ?? '', 'id');
      if (sort.value === 'price-desc') return Number(b.dataset.price) - Number(a.dataset.price) || (a.dataset.name ?? '').localeCompare(b.dataset.name ?? '', 'id');
      return (a.dataset.name ?? '').localeCompare(b.dataset.name ?? '', 'id');
    });
    grid.replaceChildren(...ordered);
    for (const card of ordered) {
      card.hidden = !((card.dataset.name?.includes(query) ?? false) && (!category.value || card.dataset.category === category.value));
      if (!card.hidden) visible++;
    }
    count.textContent = `${visible} menu ditemukan`;
    empty.hidden = visible > 0;
    tabs?.querySelectorAll<HTMLButtonElement>('[data-category-value]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.categoryValue === category.value));
    });
  };
  search.addEventListener('input', update);
  category.addEventListener('change', update);
  sort.addEventListener('change', update);
  tabs?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category-value]');
    if (!button) return;
    category.value = button.dataset.categoryValue ?? '';
    update();
  });
  document.querySelector('#reset')?.addEventListener('click', () => { form.reset(); update(); search.focus(); });
  update();
}

document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-quick-add]');
  if (!button) return;
  try {
    saveCart(addToCart(readCart(), button.dataset.quickAdd ?? '', 1));
    button.textContent = 'Ditambahkan';
    const feedback = document.querySelector<HTMLElement>('[data-cart-feedback]');
    const productName = button.closest('.product-card')?.querySelector('h2')?.textContent?.trim() ?? 'Produk';
    if (feedback) feedback.textContent = `${productName} ditambahkan ke keranjang.`;
    window.setTimeout(() => { button.textContent = 'Tambah'; }, 1600);
  } catch {
    button.textContent = 'Gagal';
    window.setTimeout(() => { button.textContent = 'Tambah'; }, 1600);
  }
});

document.querySelectorAll<HTMLImageElement>('.product-media img, .featured-category-media img').forEach((image) => {
  const fallback = () => {
    const text = document.createElement('span');
    text.textContent = 'Foto produk belum tersedia';
    image.replaceWith(text);
  };
  image.addEventListener('error', fallback, { once: true });
  if (image.complete && image.naturalWidth === 0) fallback();
});
