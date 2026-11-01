# Increment 5 — foto menu (rancangan lokal)

Status: kode lokal disiapkan, upload produksi **belum aktif**. Lampiran instruksi pengguna terpotong pada bagian 8. Dokumen ini tidak menyatakan Storage produksi telah diuji.

## Fakta audit dan batas aktivasi

- Audit produksi yang dilaporkan sebelumnya: `storage.buckets` kosong dan tidak ditemukan policy `storage.objects`. Belum ada pembacaan ulang langsung dari proyek produksi pada tahap ini.
- Migrasi menu lokal hanya memberi admin INSERT/UPDATE pada `name`, `description`, `category`, `price`, dan `is_available`; `image_url` tidak termasuk. Kode upload tidak akan dapat menyimpan URL sampai grant dan RLS terkait ditinjau dan diterapkan pada lingkungan terisolasi.
- `MENU_MUTATIONS_ENABLED` dan `MENU_UPLOAD_ENABLED` default `false`. Keduanya harus tetap `false` pada produksi sampai seluruh uji selesai dan ada persetujuan terpisah. `ORDERS_ENABLED` tidak diubah.
- Foto lama dari `image_url` dan pemetaan lokal tetap dipakai ketika form edit disimpan tanpa file. Tidak ada operasi hapus foto lama.

## Rancangan Storage untuk lingkungan uji terisolasi

1. Buat bucket khusus `menu-photos` sebagai **public bucket** agar URL foto dapat dipakai katalog tanpa sesi. Batasi ukuran file 5 MiB dan MIME ke `image/jpeg`, `image/png`, `image/webp` di konfigurasi bucket. Pastikan setting aktual dengan membaca kembali bucket tersebut. Public bucket membuat berkas dapat diakses siapa pun yang mengetahui URL; jangan masukkan data pribadi.
2. Aktifkan RLS pada `storage.objects`. Policy INSERT harus terbatas pada role `authenticated`, bucket `menu-photos`, path awalan `products/`, dan profil dengan `id = auth.uid()`, `role = 'admin'`, serta `full_name` terisi. Jangan beri UPDATE, DELETE, atau upsert. Public bucket menangani akses baca objek; periksa bahwa kebijakan lain tidak memperluas akses tulis.
3. Perluas grant kolom `image_url` untuk INSERT dan UPDATE di `public.menu_items` hanya bagi role `authenticated`; RLS admin menu yang sudah ditinjau tetap menjadi syarat. Tinjau skema, grant, policy, dan perilaku Data API aktual sebelum menulis migrasi produksi. Admin yang memiliki akses Data API langsung juga dapat mengisi URL pada kolom ini; pertimbangkan pembatasan tambahan pada lapisan database bila URL harus selalu berasal dari bucket.
4. Uji dengan akun admin dan non-admin sungguhan pada proyek Supabase **terisolasi**: upload valid, MIME palsu, signature palsu, >5 MiB, tanpa sesi, non-admin, kegagalan Storage, kegagalan penyimpanan DB, baca foto tanpa sesi, edit tanpa file, dan katalog publik. Pastikan foto yang diunggah benar-benar dapat dimuat, bukan hanya URL terbentuk.
5. Setelah semua hasil ditinjau, operator dapat mengaktifkan kedua flag **hanya di lingkungan uji**. Aktivasi produksi memerlukan persetujuan dan prosedur terpisah.

## Kegagalan parsial

Storage dan PostgreSQL tidak berbagi transaksi. Bila upload berhasil tetapi penulisan `menu_items` gagal, objek baru dapat menjadi yatim. Kode tidak menghapusnya otomatis karena DELETE Storage belum disetujui. Pesan error menyatakan kondisi tersebut. Operator dapat membandingkan path `products/` di bucket dengan URL `menu_items.image_url` dan menghapus objek yang terbukti tidak dirujuk melalui prosedur tepercaya setelah peninjauan. Jangan menghapus foto lama atau objek yang dipakai produk lain.

Server membuat nama objek UUID dan memverifikasi ukuran, MIME, serta signature JPEG/PNG/WebP sebelum upload. Pemeriksaan signature bukan jaminan berkas sepenuhnya dapat didekode; uji pemuatan gambar di lingkungan terisolasi tetap diperlukan.
