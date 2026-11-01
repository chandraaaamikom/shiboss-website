
import { rupiah } from '../lib/validation/menu.ts';
import type { OrderReceipt } from '../types/order.ts';
import { receiptKey } from './cart-store.ts';

interface GuestReceipt extends OrderReceipt {
  guest_access_token: string;
}

interface GuestOrder {
  order_number: string;
  order_status: 'pending' | 'confirmed' | 'cancelled';
  table_number: string | null;
  total_amount: number;
  created_at: string;
  items: OrderReceipt['items'];
  payment: {
    payment_method: string;
    payment_status: 'pending' | 'paid' | 'rejected';
    amount: number;
    proof_uploaded_at: string | null;
  } | null;
}

const container = document.querySelector<HTMLElement>('[data-confirmation]');

const orderLabels = {
  pending: 'Menunggu konfirmasi',
  confirmed: 'Pesanan dikonfirmasi',
  cancelled: 'Pesanan dibatalkan',
};

const paymentLabels = {
  pending: 'Menunggu verifikasi pembayaran',
  paid: 'Pembayaran berhasil diverifikasi',
  rejected: 'Pembayaran ditolak',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className = ''
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;

  if (className) element.className = className;

  return element;
}

function validGuestReceipt(value: unknown): value is GuestReceipt {
  if (!value || typeof value !== 'object') return false;

  const receipt = value as Partial<GuestReceipt>;

  return (
    typeof receipt.order_number === 'string' &&
    /^SHB-[0-9a-f]{32}$/.test(receipt.order_number) &&
    typeof receipt.guest_access_token === 'string' &&
    /^[0-9a-f]{64}$/.test(receipt.guest_access_token) &&
    Array.isArray(receipt.items) &&
    receipt.items.length > 0
  );
}

function validGuestOrder(value: unknown): value is GuestOrder {
  if (!value || typeof value !== 'object') return false;

  const order = value as Partial<GuestOrder>;

  return (
    typeof order.order_number === 'string' &&
    ['pending', 'confirmed', 'cancelled'].includes(
      order.order_status ?? ''
    ) &&
    typeof order.total_amount === 'number' &&
    Number.isFinite(order.total_amount) &&
    order.total_amount > 0 &&
    Array.isArray(order.items) &&
    order.items.length > 0 &&
    (
      order.payment === null ||
      (
        typeof order.payment === 'object' &&
        ['pending', 'paid', 'rejected'].includes(
          order.payment.payment_status
        )
      )
    )
  );
}

if (container) {
  let receipt: GuestReceipt | null = null;

  try {
    const stored = sessionStorage.getItem(receiptKey);
    const parsed: unknown = stored ? JSON.parse(stored) : null;

    if (validGuestReceipt(parsed)) {
      receipt = parsed;
    }
  } catch {
    receipt = null;
  }

  container.replaceChildren();

  if (!receipt) {
    container.append(
      createElement('h1', 'Konfirmasi pesanan tidak ditemukan'),
      createElement(
        'p',
        'Data akses pesanan tidak tersedia pada sesi browser ini. Jika pesanan sudah terkirim, hubungi staf kedai.'
      )
    );

    const link = createElement(
      'a',
      'Kembali ke menu',
      'button secondary'
    );

    link.href = '/menu';
    container.append(link);
  } else {
    const heading = createElement('h1', 'Pesanan tercatat');

    const number = createElement(
      'p',
      `Nomor pesanan: ${receipt.order_number}`
    );

    const table = createElement('p', 'Meja: Memuat...');
    const orderStatus = createElement('p', 'Status pesanan: Memuat...');
    const paymentStatus = createElement(
      'p',
      'Status pembayaran: Memuat...'
    );

    const list = document.createElement('ul');

    for (const item of receipt.items) {
      list.append(
        createElement(
          'li',
          `${item.product_name} × ${item.quantity} : ${rupiah(item.subtotal)}`
        )
      );
    }

    const total = createElement(
      'p',
      `Total: ${rupiah(receipt.total_amount)}`,
      'detail-price'
    );

    const paymentInfo = createElement(
      'p',
      'Silakan lakukan pembayaran menggunakan QRIS resmi Kedai Shiboss. Admin akan memeriksa transaksi secara manual.'
    );

    const updated = createElement(
      'p',
      'Memuat status pembayaran terbaru...'
    );

    // Form upload bukti pembayaran
    const uploadSection = document.createElement('section');
    uploadSection.className = 'payment-proof-section';

    const uploadHeading = createElement(
      'h2',
      'Upload Bukti Pembayaran'
    );

    const uploadDescription = createElement(
      'p',
      'Unggah foto atau screenshot transaksi QRIS yang berhasil.'
    );

    const fileLabel = createElement(
      'label',
      'Pilih foto bukti pembayaran'
    );

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.setAttribute('aria-label', 'Pilih bukti pembayaran');

    fileLabel.append(fileInput);

    const preview = document.createElement('img');
    preview.alt = 'Preview bukti pembayaran';
    preview.hidden = true;
    preview.style.maxWidth = '100%';
    preview.style.maxHeight = '300px';
    preview.style.objectFit = 'contain';

    const uploadMessage = createElement(
      'p',
      'Belum ada bukti pembayaran yang dipilih.'
    );

    const uploadButton = createElement(
      'button',
      'Kirim bukti pembayaran',
      'button'
    );

    uploadButton.type = 'button';
    uploadButton.disabled = true;

    uploadSection.append(
      uploadHeading,
      uploadDescription,
      fileLabel,
      preview,
      uploadMessage,
      uploadButton
    );

    const refresh = createElement(
      'button',
      'Periksa status sekarang',
      'button secondary'
    );

    refresh.type = 'button';

    const link = createElement(
      'a',
      'Kembali ke menu',
      'button secondary'
    );

    link.href = '/menu';

    container.append(
      heading,
      number,
      table,
      orderStatus,
      paymentStatus,
      list,
      total,
      paymentInfo,
      uploadSection,
      updated,
      refresh,
      link
    );

    let checking = false;
    let uploading = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previewUrl: string | null = null;
    let paymentPending = false;

    function clearPreview() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }

      preview.removeAttribute('src');
      preview.hidden = true;
    }

    function updateUploadVisibility() {
      uploadSection.hidden = !paymentPending;
      uploadButton.disabled =
        uploading || !paymentPending || !fileInput.files?.length;
    }

    fileInput.addEventListener('change', () => {
      clearPreview();

      const file = fileInput.files?.[0];

      if (!file) {
        uploadMessage.textContent =
          'Belum ada bukti pembayaran yang dipilih.';
        updateUploadVisibility();
        return;
      }

      if (!allowedTypes.includes(file.type)) {
        fileInput.value = '';
        uploadMessage.textContent =
          'Format file harus JPEG, PNG, atau WebP.';
        updateUploadVisibility();
        return;
      }

      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        fileInput.value = '';
        uploadMessage.textContent =
          'Ukuran gambar harus lebih dari 0 dan maksimal 5 MB.';
        updateUploadVisibility();
        return;
      }

      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.hidden = false;

      uploadMessage.textContent =
        `File dipilih: ${file.name}`;

      updateUploadVisibility();
    });

    async function uploadProof() {
      if (uploading || !paymentPending) return;

      const file = fileInput.files?.[0];

      if (!file) {
        uploadMessage.textContent =
          'Pilih foto bukti pembayaran terlebih dahulu.';
        return;
      }

      if (
        !allowedTypes.includes(file.type) ||
        file.size <= 0 ||
        file.size > MAX_FILE_SIZE
      ) {
        uploadMessage.textContent =
          'File tidak valid. Gunakan JPEG, PNG, atau WebP maksimal 5 MB.';
        return;
      }

      uploading = true;
      updateUploadVisibility();

      uploadButton.textContent = 'Mengunggah...';
      uploadMessage.textContent =
        'Sedang mengirim bukti pembayaran. Jangan tutup halaman ini.';

      try {
        const formData = new FormData();

        formData.append('order_number', receipt!.order_number);
        formData.append(
          'guest_access_token',
          receipt!.guest_access_token
        );
        formData.append('proof', file);

        const response = await fetch(
          '/api/payments/upload-proof',
          {
            method: 'POST',
            body: formData,
            cache: 'no-store',
          }
        );

        const result = await response.json() as {
          status?: string;
          message?: string;
        };

        if (!response.ok || result.status !== 'ready') {
          throw new Error(
            result.message ??
            'Bukti pembayaran gagal dikirim.'
          );
        }

        fileInput.value = '';
        clearPreview();

        uploadMessage.textContent =
          'Bukti pembayaran berhasil dikirim. Menunggu verifikasi admin.';

        uploadButton.textContent = 'Bukti berhasil dikirim';

        paymentInfo.textContent =
          'Bukti pembayaran sudah diterima sistem dan menunggu pemeriksaan admin.';

        await checkOrder();

      } catch (error) {
        uploadMessage.textContent =
          error instanceof Error
            ? error.message
            : 'Terjadi kesalahan saat mengirim bukti pembayaran.';
      } finally {
        uploading = false;
        uploadButton.textContent = 'Kirim bukti pembayaran';
        updateUploadVisibility();
      }
    }

    uploadButton.addEventListener('click', () => {
      void uploadProof();
    });

    async function checkOrder() {
      if (checking || stopped) return;

      checking = true;
      refresh.disabled = true;
      updated.textContent = 'Memeriksa status pesanan...';

      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(receipt!.order_number)}/status`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              guest_access_token: receipt!.guest_access_token,
            }),
            cache: 'no-store',
          }
        );

        const result = await response.json() as {
          status?: string;
          order?: unknown;
          message?: string;
        };

        if (!response.ok || result.status !== 'ready') {
          throw new Error(
            result.message ??
            'Status pesanan belum dapat diperiksa.'
          );
        }

        if (!validGuestOrder(result.order)) {
          throw new Error('Data status pesanan tidak valid.');
        }

        const order = result.order;

        if (order.order_number !== receipt!.order_number) {
          throw new Error('Nomor pesanan tidak sesuai.');
        }

        table.textContent =
          `Nomor meja: ${order.table_number ?? '-'}`;

        orderStatus.textContent =
          `Status pesanan: ${orderLabels[order.order_status]}`;

        if (order.payment) {
          paymentStatus.textContent =
            `Status pembayaran: ${paymentLabels[order.payment.payment_status]}`;

          paymentPending =
            order.payment.payment_status === 'pending';

          paymentInfo.textContent =
            order.payment.payment_status === 'pending'
              ? order.payment.proof_uploaded_at
                ? 'Bukti pembayaran sudah diterima. Admin sedang melakukan verifikasi. Jika perlu, kamu masih dapat mengirim ulang bukti sebelum admin memverifikasi pembayaran.'
                : 'Silakan lakukan pembayaran menggunakan QRIS resmi Kedai Shiboss, kemudian unggah bukti transaksi di bawah.'
              : order.payment.payment_status === 'paid'
                ? 'Pembayaran telah diverifikasi oleh admin.'
                : 'Pembayaran sebelumnya ditolak. Silakan hubungi staf kedai untuk informasi lebih lanjut.';

          if (order.payment.proof_uploaded_at) {
            uploadMessage.textContent =
              'Bukti pembayaran sudah pernah dikirim. Kamu dapat menggantinya selama pembayaran belum diverifikasi.';
          }

        } else {
          paymentPending = false;

          paymentStatus.textContent =
            'Status pembayaran: Belum tersedia';

          paymentInfo.textContent =
            'Informasi pembayaran belum tersedia. Silakan hubungi staf kedai.';
        }

        updateUploadVisibility();

        if (order.order_status === 'cancelled') {
          paymentPending = false;
          updateUploadVisibility();
        }

        total.textContent =
          `Total: ${rupiah(order.total_amount)}`;

        updated.textContent =
          `Terakhir diperbarui: ${new Date().toLocaleTimeString('id-ID')}`;

        if (
          order.order_status === 'confirmed' ||
          order.order_status === 'cancelled'
        ) {
          stopped = true;
          updated.textContent += '. Pemantauan otomatis selesai.';
        }

      } catch (error) {
        updated.textContent = error instanceof Error
          ? error.message
          : 'Gagal memeriksa status pesanan.';
      } finally {
        checking = false;
        refresh.disabled = stopped;

        if (!stopped) {
          timer = setTimeout(checkOrder, 15000);
        }
      }
    }

    refresh.addEventListener('click', () => {
      if (timer) clearTimeout(timer);
      void checkOrder();
    });

    void checkOrder();
  }
}
