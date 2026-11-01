# Pengujian integrasi pesanan pada PostgreSQL terisolasi

Status saat disiapkan: **belum dijalankan pada PostgreSQL**. Tidak ada perubahan pada proyek Supabase utama. `ORDERS_ENABLED` tetap nonaktif.

## Prasyarat dan batas aman

Siapkan server PostgreSQL lokal pada loopback dengan sebuah database **kosong dan khusus uji** bernama `shiboss_test` (atau `shiboss_test_...`). Diperlukan `psql` dalam PATH atau path eksplisit, serta role lokal uji yang dapat membuat role, schema, dan tabel. Runner menolak database dengan tabel/view yang sudah ada, nama di luar pola tersebut, dan server yang tidak melaporkan alamat loopback. Ia tidak membaca `.env`, URL Supabase, atau kunci API. Migrasi hanya diterapkan setelah pemeriksaan target lulus. Database uji ditinggalkan untuk inspeksi manual; buat database kosong baru untuk mengulang.

Pada Windows PowerShell, setelah PostgreSQL dan `psql` lokal tersedia serta database kosong dibuat secara manual:

```powershell
$env:SHIBOSS_TEST_DB_NAME = 'shiboss_test'
$env:SHIBOSS_TEST_DB_USER = '<role_admin_lokal_khusus_uji>'
# Opsional: $env:SHIBOSS_TEST_DB_PORT = '5432'
# Opsional: $env:SHIBOSS_TEST_PSQL = '<path_lokal_ke_psql.exe>'
npm run test:db:isolated
```

Gunakan metode autentikasi lokal atau berkas `.pgpass` di luar repository; jangan memasukkan sandi ke argumen command, kode, atau dokumen. Runner menggunakan `127.0.0.1`, nama database yang dibatasi, dan koneksi TCP; **jangan arahkan port loopback itu melalui tunnel ke produksi**. Persiapan database kosong tetap perlu dicek oleh operator sebelum menjalankan skrip. Untuk proyek Supabase terisolasi yang tidak berjalan lokal, gunakan prosedur manual di bawah; runner ini sengaja tidak menerima URL remote.

## Cakupan runner

`scripts/test-orders-isolated.mjs` memuat `supabase/tests/bootstrap_isolated.sql`, migrasi menu Increment 1, lalu migrasi pesanan Increment 2 pada database uji. Bootstrap hanya membuat role `anon`/`authenticated` dan stub `auth.users` untuk memenuhi FK `profiles`. Data menu, pelanggan, dan admin seluruhnya sintetis.

Runner menguji RLS, ketiadaan policy dan grant tabel, penolakan SELECT untuk kedua role, penolakan INSERT/UPDATE/DELETE untuk `anon`, hak EXECUTE RPC, owner fungsi, `SECURITY DEFINER`, dan `search_path`. Ia membuat pesanan dua item, memeriksa snapshot total dan pembayaran pending, replay identik, konflik key, serta dua panggilan serentak dengan key yang sama. Produk nonaktif, total yang diubah, jumlah tidak valid, dan kegagalan item melalui trigger uji harus menghasilkan nol baris pesanan/item/pembayaran. Constraint status dan replay setelah verifikasi admin sintetis juga diperiksa. Tiga kunci baru dipanggil untuk memperlihatkan bahwa **belum ada batas laju pada RPC**; ini observasi risiko, bukan tes bahwa mitigasi tersedia.

## Batas bukti

PostgreSQL lokal dapat membuktikan perilaku SQL, transaksi, grants, dan RLS di lingkungan itu. Ia tidak membuktikan konfigurasi PostgREST/Supabase `Exposed schemas`, perilaku API gateway, atau kebijakan produksi. Pada proyek Supabase **khusus uji** yang terpisah, inspeksi daftar exposed schemas dan pastikan `shiboss_private` tidak diekspos. Uji REST sebagai `anon` dan `authenticated`: tabel pesanan tidak dapat dibaca/ditulis; RPC publik hanya dapat dipanggil `anon`; fungsi privat tidak muncul sebagai endpoint. Simulasikan pengiriman ulang setelah timeout, dua request paralel, dan lonjakan kunci baru. Jangan gunakan database utama untuk langkah ini.

Tanpa identitas pelanggan, istilah "milik pelanggan lain" hanya dapat diuji sebagai larangan akses tabel dan larangan memperoleh receipt melalui nomor pesanan atau payload berbeda. Pemegang **kunci idempotensi dan payload lengkap** masih dapat melakukan replay receipt; kunci itu bertindak sebagai capability rahasia. Perlindungan terhadap kebocoran capability dan kebutuhan identitas pelanggan perlu diputuskan sebelum pelacakan status dibuka.

## Risiko produksi dan keputusan pra-aktivasi

RPC `anon` dapat dipanggil langsung lewat Supabase Data API dengan publishable key, termasuk ketika tombol checkout Astro dinonaktifkan. Pemeriksaan Origin dan batas ukuran di Astro tidak membatasi panggilan langsung tersebut. [Panduan keamanan Data API Supabase](https://supabase.com/docs/guides/api/securing-your-api) menjelaskan bahwa grants mengontrol akses fungsi dan bahwa RLS tidak berlaku pada fungsi; panduan itu juga membahas pemeriksaan pra-request untuk batas laju. Sebelum produksi, pilih kontrol yang benar-benar bekerja pada jalur RPC langsung: misalnya pemeriksaan pra-request Data API dengan penyimpanan kuota dan identitas sumber yang dapat dipercaya, **atau** cabut EXECUTE RPC dari `anon` dan jalankan pembuatan pesanan hanya melalui backend tepercaya dengan rate limiting terpusat. Uji bypass langsung ke RPC setelah mitigasi diterapkan. Jangan menganggap batas laju Supabase Auth sebagai batas laju RPC.

`profiles` tidak diperlukan oleh pesanan pelanggan anonim. Tabel itu ada untuk FK admin sesuai ERD. Sebelum persetujuan migrasi, putuskan apakah struktur admin tetap disiapkan sekarang atau dipindah ke Increment 3 bersama `created_by`/`verified_by`; jangan mengumpulkan profil pelanggan untuk menyelesaikan persoalan ini.
