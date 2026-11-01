const search = document.querySelector<HTMLInputElement>('[data-admin-search]');
const category = document.querySelector<HTMLSelectElement>('[data-admin-category]');
const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-admin-chip]')];
const rows = [...document.querySelectorAll<HTMLElement>('[data-admin-row]')];
const count = document.querySelector<HTMLElement>('[data-admin-count]');
const empty = document.querySelector<HTMLElement>('[data-admin-empty]');
const savedNotice = document.querySelector<HTMLElement>('[data-admin-saved-notice]');
const savedMessage = sessionStorage.getItem('admin-menu-saved');
if (savedMessage && savedNotice) {
  savedNotice.textContent = savedMessage;
  savedNotice.hidden = false;
  sessionStorage.removeItem('admin-menu-saved');
}
document.querySelectorAll<HTMLImageElement>('[data-admin-image]').forEach((image) => {
  const showFallback = () => {
    image.hidden = true;
    const fallback = image.nextElementSibling;
    if (fallback instanceof HTMLElement) fallback.hidden = false;
  };
  image.addEventListener('error', showFallback);
  if (image.complete && image.naturalWidth === 0) showFallback();
});

function filterRows() {
  const query = search?.value.trim().toLocaleLowerCase('id') ?? '';
  const selected = category?.value ?? '';
  let visible = 0;
  for (const row of rows) {
    const matchesText = !query || row.dataset.name?.includes(query)
      || row.dataset.category?.toLocaleLowerCase('id').includes(query);
    row.hidden = !(matchesText && (!selected || row.dataset.category === selected));
    if (!row.hidden) visible++;
  }
  if (count) count.textContent = `${visible} produk ditemukan`;
  if (empty) empty.hidden = visible !== 0;
  chips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.adminChip === selected));
}

search?.addEventListener('input', filterRows);
category?.addEventListener('change', filterRows);
chips.forEach((chip) => chip.addEventListener('click', () => {
  if (category) category.value = chip.dataset.adminChip ?? '';
  filterRows();
}));

const dialog = document.querySelector<HTMLDialogElement>('[data-admin-dialog]');
let saving = false;
document.querySelectorAll<HTMLButtonElement>('[data-admin-open]').forEach((button) => button.addEventListener('click', () => {
  dialog?.querySelector<HTMLElement>('#edit-form')?.setAttribute('hidden', '');
  dialog?.querySelector<HTMLElement>('#add-form')?.removeAttribute('hidden');
  dialog?.showModal();
}));
dialog?.querySelector<HTMLButtonElement>('[data-admin-close]')?.addEventListener('click', () => { if (!saving) dialog.close(); });
dialog?.addEventListener('click', (event) => { if (event.target === dialog && !saving) dialog.close(); });
dialog?.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
if (dialog?.dataset.openEdit === 'true') {
  dialog.querySelector<HTMLElement>('#add-form')?.setAttribute('hidden', '');
  dialog.querySelector<HTMLElement>('#edit-form')?.removeAttribute('hidden');
  dialog.showModal();
  dialog.addEventListener('close', () => history.replaceState(null, '', '/admin/menu'), { once: true });
}

document.querySelectorAll<HTMLFormElement>('[data-admin-product-form]').forEach((form) => {
  const photoInput = form.querySelector<HTMLInputElement>('input[name="photo"]');
  const photoNew = form.querySelector<HTMLImageElement>('[data-photo-new]');
  const photoExisting = form.querySelector<HTMLImageElement>('[data-photo-existing]');
  const photoEmpty = form.querySelector<HTMLElement>('[data-photo-empty]');
  const photoInfo = form.querySelector<HTMLElement>('[data-photo-info]');
  const photoClear = form.querySelector<HTMLButtonElement>('[data-photo-clear]');
  let objectUrl: string | null = null;
  const clearPreview = (resetInput = true) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    if (photoInput && resetInput) photoInput.value = '';
    if (photoNew) { photoNew.hidden = true; photoNew.removeAttribute('src'); }
    if (photoExisting) photoExisting.hidden = false;
    if (photoEmpty) photoEmpty.hidden = false;
    if (photoClear) photoClear.hidden = true;
    if (photoInfo && !photoInput?.disabled) photoInfo.textContent = 'JPEG, PNG, atau WebP, maksimal 5 MB.';
  };
  photoClear?.addEventListener('click', () => clearPreview());
  dialog?.addEventListener('close', () => clearPreview());
  photoInput?.addEventListener('change', () => {
    clearPreview(false);
    const file = photoInput.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      if (photoInfo) photoInfo.textContent = 'Pilih JPEG, PNG, atau WebP berukuran maksimal 5 MB.';
      photoInput.value = '';
      return;
    }
    objectUrl = URL.createObjectURL(file);
    if (photoNew) { photoNew.src = objectUrl; photoNew.hidden = false; }
    if (photoExisting) photoExisting.hidden = true;
    if (photoEmpty) photoEmpty.hidden = true;
    if (photoClear) photoClear.hidden = false;
    if (photoInfo) photoInfo.textContent = `${file.name.slice(0, 100)} · ${(file.size / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 2 })} MB`;
  });
  const priceInput = form.querySelector<HTMLInputElement>('input[name="price"]');
  const pricePreview = form.querySelector<HTMLElement>('[data-admin-price-preview]');
  priceInput?.addEventListener('input', () => {
    if (!pricePreview) return;
    const price = Number(priceInput.value);
    pricePreview.textContent = priceInput.value && Number.isFinite(price)
      ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price)
      : 'Masukkan harga dalam kelipatan Rp1.000.';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (dialog?.dataset.menuWriteEnabled !== 'true') return;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const feedback = form.querySelector<HTMLElement>('[data-admin-form-feedback]');
    if (!submit || submit.disabled) return;
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const selectedPhoto = photoInput?.files?.[0];
    if (selectedPhoto && (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedPhoto.type)
      || selectedPhoto.size === 0 || selectedPhoto.size > 5 * 1024 * 1024)) {
      if (feedback) { feedback.hidden = false; feedback.textContent = 'Foto harus JPEG, PNG, atau WebP berukuran maksimal 5 MB.'; }
      return;
    }
    const mode = form.dataset.mode;
    const id = form.dataset.id;
    const price = Number(fields.get('price'));
    if (!Number.isSafeInteger(price) || price < 1000 || price % 1000 !== 0) {
      if (feedback) { feedback.hidden = false; feedback.textContent = 'Harga harus kelipatan Rp1.000 dan lebih besar dari nol.'; }
      return;
    }
    const payload = {
      name: String(fields.get('name') ?? ''),
      category: String(fields.get('category') ?? ''),
      description: String(fields.get('description') ?? '').trim() || null,
      price,
      is_available: fields.get('is_available') === 'true',
    };
    const endpoint = mode === 'edit' ? `/api/admin/menu/${encodeURIComponent(id ?? '')}` : '/api/admin/menu';
    submit.disabled = true;
    saving = true;
    const originalLabel = submit.textContent;
    submit.textContent = 'Menyimpan…';
    form.setAttribute('aria-busy', 'true');
    if (feedback) { feedback.hidden = false; feedback.textContent = selectedPhoto ? 'Mengunggah foto dan menyimpan menu…' : 'Menyimpan menu…'; }
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (selectedPhoto) {
        const multipart = new FormData();
        multipart.set('name', payload.name);
        multipart.set('category', payload.category);
        multipart.set('description', payload.description ?? '');
        multipart.set('price', String(payload.price));
        multipart.set('is_available', String(payload.is_available));
        multipart.set('photo', selectedPhoto);
        body = multipart;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify(payload);
      }
      const response = await fetch(endpoint, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers, body,
      });
      const result: unknown = await response.json();
      const message = result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
        ? result.message : 'Menu belum dapat disimpan. Coba lagi.';
      if (!response.ok || !result || typeof result !== 'object' || !('status' in result) || result.status !== 'ready'
        || !('id' in result) || typeof result.id !== 'string') {
        if (feedback) feedback.textContent = response.ok ? 'Penyimpanan belum terkonfirmasi. Muat ulang daftar sebelum mencoba lagi.' : message;
        return;
      }
      sessionStorage.setItem('admin-menu-saved', message);
      dialog?.close();
      window.location.assign('/admin/menu');
    } catch {
      if (feedback) feedback.textContent = 'Koneksi gagal. Menu belum disimpan.';
    } finally {
      submit.disabled = false;
      saving = false;
      submit.textContent = originalLabel;
      form.removeAttribute('aria-busy');
    }
  });
});
