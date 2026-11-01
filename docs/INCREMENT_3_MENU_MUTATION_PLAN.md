# Increment 3 — rancangan mutasi menu (belum diaktifkan)

Dokumen ini mencatat hasil audit kode lokal pada 27 Oktober 2026. Ini bukan migrasi dan tidak mengubah Supabase produksi.

## Keadaan yang terverifikasi di kode

- `src/pages/admin/menu.astro` memanggil `loadMenu()`, yaitu pembaca katalog publik yang hanya mengambil `is_available = true`. Produk nonaktif belum dapat dilihat oleh admin.
- `src/components/AdminMenuForm.astro` adalah pratinjau. Submit dan input foto nonaktif. Tidak ada endpoint `/api/admin/menu` untuk mutasi.
- `src/middleware.ts` memeriksa setiap halaman dan API admin dengan sesi Supabase Auth serta baris `profiles` milik UID yang sama dan `role = 'admin'`.
- Migrasi lokal `202610240001_menu_items.sql` mengaktifkan RLS, memberi `anon` dan `authenticated` hak `SELECT` saja, dan hanya mempunyai policy baca produk tersedia. Tidak ada grant/policy untuk membaca produk nonaktif atau menulis produk.
- Tidak ada bucket maupun policy Supabase Storage untuk foto produk dalam migrasi lokal. Foto lokal tetap dipetakan berdasarkan ID dan URL Supabase yang valid tetap memiliki prioritas.
- `order_items.menu_item_id` pada migrasi pesanan lokal memakai `ON DELETE RESTRICT`. Aturan bisnis BR-44 meminta produk yang sudah dipesan dinonaktifkan agar riwayat pesanan terjaga.

Migrasi lokal tidak membuktikan konfigurasi database produksi saat ini. Login admin yang berfungsi juga tidak membuktikan hak tulis tabel menu atau kebijakan Storage.

## Pemeriksaan database secara baca-saja oleh operator

Jalankan di SQL Editor proyek yang benar, lalu tinjau hasilnya tanpa mengubah data. Jangan menyertakan token atau kata sandi dalam hasil yang dibagikan.

```sql
select to_regclass('public.menu_items') as menu_table,
       to_regclass('public.profiles') as profiles_table,
       to_regclass('public.order_items') as order_items_table;

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
where c.oid in ('public.menu_items'::regclass, 'public.profiles'::regclass);

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('menu_items', 'profiles')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('menu_items', 'profiles'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
```

Jika suatu tabel belum ada, hentikan query lanjutan yang merujuk tabel itu; query pertama tetap dapat dipakai untuk mengetahui keberadaannya. Periksa juga pengaturan **Data API → Exposed schemas** di Dashboard karena grant dan RLS saja tidak membuktikan tabel dapat dijangkau melalui API.

## Rancangan setelah persetujuan terpisah

1. Buat migrasi baru yang hanya mengatur grant dan policy `public.menu_items`. Pertahankan RLS dan policy publik `is_available = true`. Admin sah perlu policy `SELECT` atas semua produk, termasuk yang nonaktif, dan policy `INSERT`/`UPDATE` dengan pemeriksaan UID terhadap `profiles.role = 'admin'`. Berikan hak kolom seminimal mungkin kepada `authenticated`; jangan berikan hak tulis kepada `anon`, jangan pakai service role di aplikasi, dan jangan mendasarkan otorisasi pada metadata yang dapat diubah pengguna.
2. Putuskan arti **Hapus** sebelum memberi hak `DELETE`. Rekomendasi sesuai BR-44: menu yang memiliki riwayat pesanan hanya dapat dinonaktifkan. Jika hapus permanen diizinkan untuk menu tanpa riwayat, operasi harus memeriksa relasi pesanan dan menangani konflik foreign key tanpa menghapus riwayat. Opsi ini memerlukan keputusan produk dan pengujian database terisolasi.
3. Setelah policy diterapkan dan diuji terisolasi, tambahkan layanan baca admin yang menggunakan sesi pengguna terverifikasi. Jangan pakai `loadMenu()` untuk mengedit produk nonaktif.
4. Tambahkan API Astro server-side untuk tambah, edit, ubah ketersediaan, dan aksi hapus yang disetujui. Middleware dan handler harus memeriksa admin; validasi server harus membatasi nama, kategori, harga positif dalam `numeric(12,2)`, field wajib, UUID, panjang deskripsi, serta URL gambar. Klien hanya mengirim data, tidak mengirim role atau harga tepercaya. Gunakan perlindungan origin/CSRF, batas ukuran request, dan penolakan pengiriman ganda. Setelah sukses, muat ulang daftar dari layanan admin dan tampilkan pesan hasil yang jelas.
5. Upload foto merupakan pekerjaan terpisah. Tentukan bucket, MIME dan ukuran maksimum, penamaan berbasis ID produk, policy `storage.objects` khusus admin, serta verifikasi berkas yang sebenarnya. Sampai itu disetujui, input upload tetap nonaktif; URL valid dan aset lokal yang sudah ada tetap digunakan.

## Gerbang pengujian sebelum produksi

- Pada Supabase/PostgreSQL **terisolasi**, uji `anon`, pengguna terautentikasi non-admin, admin sah, dan admin yang sesinya kedaluwarsa untuk setiap operasi. Buktikan produk nonaktif terlihat hanya bagi admin dan tidak muncul di API publik.
- Uji validasi nama/kategori kosong, harga nol/negatif/terlalu besar, UUID salah, URL gambar tidak aman, request berulang, backend gagal, dan hasil mutasi yang tidak mengembalikan baris.
- Uji konflik penghapusan terhadap item pesanan serta perubahan ketersediaan dan harga tanpa mengubah snapshot pesanan lama.
- Uji Storage secara terpisah sebelum mengaktifkan upload; keberadaan bucket tidak membuktikan policy upload aman.
- Jalankan `npm run check`, `npm test`, dan `npm run build` setelah implementasi. Pengujian unit tidak menggantikan uji grant/RLS pada database nyata.

Sampai gerbang ini terpenuhi, UI tambah/edit tetap pratinjau dan tidak ada operasi tulis menu yang diaktifkan.
