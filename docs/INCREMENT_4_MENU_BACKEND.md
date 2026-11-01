# Increment 4 — backend menu admin (lokal, belum aktif)

`MENU_MUTATIONS_ENABLED` default-nya nonaktif. Migrasi `202610270001_admin_menu_write.sql` hanya disiapkan lokal; belum dijalankan pada produksi. Form tambah/edit dan endpoint Astro menolak penyimpanan sampai flag diaktifkan setelah grant/RLS ditinjau dan diuji di database terisolasi. Upload foto dan hapus permanen tetap nonaktif. `ORDERS_ENABLED` tidak diubah.

## Kontrak yang dipakai

- `POST /api/admin/menu` untuk tambah; `PATCH /api/admin/menu/:id` untuk edit dan perubahan `is_available`.
- Middleware dan handler memeriksa sesi Supabase Auth serta profil admin. Server hanya menerima `name`, `category`, `description`, `price`, dan `is_available`; `role`, `image_url`, `id`, dan field lain dari browser ditolak.
- Foto Supabase lama tetap tersimpan saat edit karena kolom `image_url` tidak dikirim. Produk baru tanpa foto memakai placeholder. Pembaca admin mencakup produk nonaktif setelah policy admin tersedia; API pelanggan tetap menyaring produk aktif.
- Kegagalan database disampaikan tanpa detail internal. Tidak ada service role key.
- Form mencegah klik simpan ganda selama request berjalan. Endpoint tambah belum memiliki idempotensi lintas request; dua request POST terpisah dapat menghasilkan dua produk karena skema menu tidak memiliki kunci idempotensi atau aturan unik nama/kategori. Jangan menganggap perlindungan UI sebagai jaminan deduplikasi server.

## Prasyarat sebelum aktivasi

1. Bandingkan struktur **aktual** `menu_items` dan `profiles` dengan guard di migrasi lokal; audit yang diberikan belum mencantumkan semua tipe kolom dan constraint.
2. Uji migrasi dan berkas `supabase/tests/admin_menu_write_isolated.sql` pada database PostgreSQL baru bernama `shiboss_test` di loopback. Urutan: `bootstrap_isolated.sql`, `bootstrap_admin_menu_isolated.sql`, migrasi menu Increment 1, migrasi profil standalone, migrasi menu admin, lalu tes. Berkas tes memakai data sintetis dan `ROLLBACK`.
3. Uji lewat API sebagai anon, pengguna non-admin, dan admin sah pada lingkungan terisolasi. Periksa bahwa pengguna biasa tetap hanya melihat menu aktif dan tidak dapat menulis langsung ke Data API.
4. Setelah hasil terisolasi lulus, tinjau serta setujui migrasi untuk produksi secara terpisah. Baru setelah verifikasi pascamigrasi, set `MENU_MUTATIONS_ENABLED=true` pada server. Jangan set flag sebelum itu.

Lingkungan kerja saat dokumen dibuat tidak memiliki `psql`, Docker, atau Supabase CLI; karena itu uji PostgreSQL dan mutasi nyata belum dijalankan.
