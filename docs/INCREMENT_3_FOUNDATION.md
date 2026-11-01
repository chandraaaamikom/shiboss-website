# Increment 3 — fondasi dashboard admin

## Status saat dibuat

- Website pelanggan tetap memakai Astro SSR dan layanan menu yang sudah ada. `ORDERS_ENABLED` tetap nonaktif.
- Pemeriksaan baca-saja Data API `profiles` menghasilkan HTTP 404 pada 25 Oktober 2026. Itu menunjukkan tabel belum terlihat melalui Data API; ini bukan inspeksi katalog PostgreSQL secara langsung.
- Migrasi pesanan `202610250001_customer_orders.sql` dan migrasi admin `202610250002_admin_profile_read.sql` hanya tersimpan lokal. Keduanya belum dijalankan ke proyek utama oleh pekerjaan ini.
- `ADMIN_ENABLED` tidak disetel pada `.env` saat pembuatan fondasi, sehingga nilai efektifnya nonaktif. `.env.example` menyatakan nilai awal `false`.

## Arsitektur akses

`src/middleware.ts` menutup semua halaman `/admin` selain login, serta semua endpoint `/api/admin` selain login/logout. Saat admin diaktifkan, setiap request terlindungi membuat klien Supabase SSR berbasis cookie `HttpOnly`, memvalidasi pengguna melalui `auth.getUser()`, lalu membaca hanya baris `profiles` yang ID-nya sama dengan pengguna dan `role = 'admin'`. Sesi Auth saja tidak memberi akses. Error database atau profil yang tidak cocok menolak akses; tidak ada service role key di aplikasi.

Login dan logout memakai POST dengan pemeriksaan Origin serta tipe konten. Tidak ada pendaftaran akun admin publik dan tidak ada mekanisme `localStorage` untuk autentikasi. Respons admin memakai `no-store` dan halaman admin memakai `noindex`. Jalur login nyata belum diuji dengan akun admin dan database terisolasi, sehingga keamanan end-to-end belum diklaim selesai.

## Cakupan UI sekarang

- `/admin/login`: halaman login dan status konfigurasi; formulir nonaktif sampai `ADMIN_ENABLED=true` dan konfigurasi valid.
- `/admin`: ringkasan jumlah menu **tersedia** dari layanan menu aktual. Pesanan dan pembayaran jelas ditandai belum terhubung, tanpa angka contoh.
- `/admin/menu`: baca-saja atas menu tersedia dari `loadMenu()`, beserta pencarian, filter kategori, harga, ketersediaan, foto valid atau placeholder. Rancangan form tambah dan edit dapat dilihat tetapi tombol simpan serta input upload nonaktif.
- `/admin/orders` dan `/admin/payments`: struktur status serta pesan integrasi belum aktif. Tidak ada query transaksi, perubahan status, atau verifikasi pembayaran.

API menu publik hanya mengembalikan produk `is_available = true`. Karena itu daftar admin sekarang **bukan** daftar lengkap produk nonaktif. Sebelum manajemen menu diaktifkan, buat layanan admin tersendiri yang memakai sesi admin terverifikasi dan kebijakan RLS yang mengizinkan admin melihat produk nonaktif. Jangan memakai hasil API publik untuk mengedit produk tersembunyi.

## SQL yang masih memerlukan tinjauan

`supabase/migrations/202610250002_admin_profile_read.sql` bergantung pada migrasi pesanan Increment 2 karena tabel `profiles` dibuat di sana. SQL lokal tersebut hanya mencabut grant umum, memberi `authenticated` hak SELECT pada kolom `id`, `full_name`, dan `role`, serta membuat policy RLS untuk membaca profil sendiri yang berperan admin. Tidak ada grant INSERT/UPDATE/DELETE, admin bawaan, seed, atau kebijakan tabel pesanan/pembayaran. Akun admin harus dibuat melalui Supabase Auth dan profilnya disambungkan oleh operator tepercaya melalui prosedur terpisah; jangan membuka pendaftaran atau memberi hak membuat profil kepada pengguna biasa.

Sebelum penerapan apa pun, tinjau skema aktual secara read-only, kedua migrasi beserta urutannya, privilege/default privilege dan exposed schemas, lalu uji di PostgreSQL/Supabase **terisolasi**. Buktikan pengguna tanpa sesi, pengguna terautentikasi tanpa profil admin, dan admin sah memperoleh hasil yang berbeda pada halaman serta API. Uji bahwa hanya admin dapat membaca profilnya dan bahwa `anon` tidak dapat membaca/menulis profil. Uji cookie refresh, logout, CSRF, dan cache header. Jangan menjadikan akun di proyek utama sebagai data uji.

## Fitur yang belum boleh diaktifkan

- Operasi tulis menu membutuhkan rancangan RLS admin, validasi server, dan keputusan untuk menonaktifkan produk yang memiliki riwayat transaksi. Kebijakan tersebut belum ada.
- Upload foto membutuhkan bucket Supabase Storage yang diputuskan pemilik proyek, batas ukuran/MIME, nama objek berbasis ID, policy upload admin, pemeriksaan konten, dan pengujian akses. Tidak ada bucket atau policy yang dibuat di sini.
- Daftar pesanan, input pesanan kasir, serta pembayaran memerlukan penerapan dan uji migrasi Increment 2, otorisasi admin per operasi, validasi transisi status, dan verifikasi QRIS manual. Tidak ada endpoint operasi itu di fondasi ini.
- RPC pesanan anonim dari rancangan Increment 2 tetap memerlukan mitigasi penyalahgunaan pada jalur yang benar-benar dapat menahan pemanggilan langsung, sebelum checkout dipertimbangkan untuk produksi.

Setelah seluruh prasyarat disetujui dan diuji, `ADMIN_ENABLED=true` dapat dipasang pada konfigurasi server melalui prosedur deployment yang terpisah. Nilai ini tidak boleh dipakai sebagai pengganti autentikasi atau RLS. `ORDERS_ENABLED` tetap `false` sampai alur pelanggan disetujui secara terpisah.
