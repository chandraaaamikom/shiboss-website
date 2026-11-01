# Increment 2 — rancangan siap ditinjau, belum diterapkan di produksi

## Kondisi yang terverifikasi

- Menu publik memakai Astro SSR, `src/lib/services/menu-core.ts`, dan Supabase REST dengan Publishable Key. Data menu yang tersedia tetap dibaca dari database; foto lokal hanya fallback.
- Saat audit read-only, `/api/menu` menghasilkan HTTP 200, `ready`, 91 produk. REST untuk `profiles`, `orders`, `order_items`, dan `payments` menghasilkan HTTP 404 `PGRST205`. Ini membuktikan tabel tersebut **belum terlihat lewat Data API**, bukan pemeriksaan katalog PostgreSQL secara langsung.
- Figma Shiboss dapat dibuka sebagai referensi visual. Frame keranjang dan checkout desktop menunjukkan konten utama serta panel ringkasan di samping; halaman baru mengikuti pola itu dan token CSS yang sudah ada. Detail final seperti logo resmi dan QRIS resmi tetap bergantung pada aset pemilik kedai.

## Alur pelanggan yang disiapkan

1. Buka detail menu, pilih jumlah bulat positif, lalu tambah ke keranjang berbasis `sessionStorage`.
2. Keranjang memuat ulang menu tersedia, menghitung subtotal/total dari harga menu, dan menandai produk yang tidak lagi tersedia.
3. Checkout meminta nama dan nomor meja; catatan opsional. Satu QR menu berlaku untuk semua meja, sehingga meja tidak diisi otomatis. Alur QR meja hanya memakai QRIS.
4. Browser mengirim ID produk, jumlah, identitas, total yang dilihat pelanggan, dan UUID idempotensi. Browser **tidak** mengirim harga satuan untuk disimpan.
5. Endpoint `/api/orders` memvalidasi bentuk input. Setelah diaktifkan, RPC PostgreSQL mengunci idempotency key, memeriksa ketersediaan dan harga dari `menu_items`, membandingkan total yang ditinjau pelanggan, lalu menyimpan `orders`, `order_items`, dan `payments` dalam satu transaksi. Jika harga berubah, tidak ada pesanan dibuat dan checkout meminta pelanggan meninjau ulang.
6. Konfirmasi hanya dibuat dari respons RPC yang memuat nomor pesanan, snapshot item, total, status pesanan `pending`, dan pembayaran QRIS `pending`. Tidak ada klaim bahwa QRIS telah dibayar atau terverifikasi. Kode QRIS resmi belum tersedia; pelanggan diarahkan meminta kode resmi kepada staf.

Selama `ORDERS_ENABLED` bukan `true`, checkout menampilkan pemberitahuan dan tombol pengiriman nonaktif. Endpoint tetap menolak POST dengan HTTP 503. Alur simpan pesanan belum bisa dipakai pelanggan.

## SQL lokal yang perlu persetujuan

Lihat `supabase/migrations/202610250001_customer_orders.sql`. Migrasi ini membuat tabel `profiles`, `orders`, `order_items`, `payments`, indeks, foreign key, constraint, RLS tanpa kebijakan baca/tulis pelanggan, dan dua fungsi RPC: pembungkus `public.create_table_order` dengan hak pemanggil serta implementasi transaksi `shiboss_private.create_table_order` dengan hak pemilik dan `search_path` kosong. Hanya `anon` yang mendapat hak eksekusi RPC; tidak ada hak langsung ke tabel pesanan.

Tambahan `idempotency_key` dan `request_fingerprint` pada `orders` mencegah pesanan ganda untuk permintaan yang sama. `order_items.unit_price` dan `product_name` adalah snapshot; `subtotal` kolom generated. `orders.total_amount` dihitung dari harga menu saat transaksi. Satu catatan `payments` dengan `qris` dan `pending` dibuat atomik bersama pesanan QR meja.

**Jangan jalankan migrasi tanpa tinjauan dan persetujuan eksplisit.** Sebelum menerapkan, cocokkan skema PostgreSQL aktual melalui Dashboard/SQL editor read-only karena REST `PGRST205` tidak dapat memastikan tidak ada tabel tersembunyi. Tinjau SQL, privilege fungsi, volume/rate limiting untuk RPC anonim, serta rencana pemulihan. Setelah disetujui dan migrasi diterapkan, uji pada lingkungan aman: transaksi berhasil, rollback saat detail gagal, replay idempotensi, perubahan harga, produk tidak tersedia, RLS untuk `anon`/`authenticated`, dan pembatasan akses admin. Baru setelah uji itu set `ORDERS_ENABLED=true` pada konfigurasi server; nilai awalnya nonaktif. Jangan mengisi secret/service role key di browser.

RPC anonim berpotensi disalahgunakan untuk membanjiri pesanan. Pembatasan laju, pemantauan, dan prosedur penanganan pesanan palsu perlu diputuskan sebelum aktivasi produksi. SQL lokal belum diparse atau dieksekusi pada PostgreSQL sehingga constraint, RLS, dan atomisitas masih merupakan rancangan yang harus dibuktikan dengan uji integrasi.

## Audit keamanan migrasi lokal

- `profiles` hanya menyiapkan relasi admin yang tercantum di ERD. Alur pelanggan anonim tidak membuat profil, akun, atau mengumpulkan data profil. Tabel ini boleh ditunda ke migrasi admin bila ruang lingkup skema dipersempit sebelum persetujuan.
- `orders` memiliki PK UUID, nomor pesanan dan kunci idempotensi unik, FK admin opsional, constraint asal pesanan dan status `pending`/`confirmed`/`cancelled`. `order_items` memiliki FK ke pesanan dan menu, snapshot nama/harga, jumlah positif, subtotal generated, serta keunikan produk per pesanan. FK menu `ON DELETE RESTRICT` mempertahankan riwayat, sehingga produk yang pernah dipesan perlu dinonaktifkan alih-alih dihapus.
- `payments` membatasi satu catatan per pesanan dan memisahkan `payment_status` dari `order_status`. Status `paid`/`rejected` kini mensyaratkan `verified_by` dan `verified_at`; `pending` mewajibkan keduanya kosong. RPC pelanggan hanya membuat QRIS `pending`.
- Keempat tabel memakai RLS tanpa policy dan tanpa grant tabel untuk `anon`/`authenticated`. `authenticated` juga tidak mendapat hak RPC. `anon` hanya mendapat `USAGE` pada schema privat dan `EXECUTE` pada wrapper publik serta fungsi privat; fungsi privat tidak boleh dimasukkan ke daftar exposed schemas PostgREST. Fungsi definer harus dimiliki role tepercaya dan diuji setelah penerapan. Tidak ada endpoint GET pesanan pelanggan.
- RPC memvalidasi bentuk JSON, UUID, jumlah positif dalam rentang `integer`, nama dan meja, catatan, serta total yang ditinjau. Produk tersedia dibaca dari `public.menu_items` dengan `FOR SHARE`; harga dipercaya berasal dari baris database. Kegagalan item, pembayaran, atau constraint membatalkan satu transaksi fungsi. Ini adalah sifat rancangan SQL, belum bukti eksekusi.
- Kunci idempotensi dikunci per transaksi dan unik. Replay dengan payload sama mengembalikan receipt lama, termasuk status yang mungkin telah berubah; payload berbeda ditolak. Setelah timeout yang tidak pasti, kunci tetap dipakai meski keranjang berubah, sehingga konflik tidak berubah diam-diam menjadi pesanan kedua. Perubahan harga yang ditolak secara pasti menghasilkan HTTP 409 dan boleh memakai kunci baru setelah pelanggan meninjau ulang.
- Risiko terbuka: siapa pun yang dapat mengakses RPC anonim dapat membuat banyak pesanan berbeda dengan UUID baru. Batas ukuran request di endpoint Astro tidak melindungi pemanggilan RPC Supabase secara langsung. Sebelum aktivasi, pilih rate limiting di lapisan yang benar-benar menahan RPC langsung, pemantauan lonjakan, dan prosedur penanganan penyalahgunaan. Jangan menganggap Origin check sebagai kontrol autentikasi.

## Prosedur uji pada database terisolasi sebelum produksi

Runner lokal, pembatasan target, prasyarat, serta batas bukti dijelaskan di [INTEGRATION_TEST_ISOLATED.md](INTEGRATION_TEST_ISOLATED.md). Runner tersebut belum dijalankan pada PostgreSQL karena lingkungan uji lokal belum tersedia.

1. Siapkan proyek Supabase atau PostgreSQL terisolasi dengan skema `menu_items` yang setara; pastikan `shiboss_private` tidak termasuk exposed schemas. Jalankan migrasi **hanya di sana** dan periksa catalog tabel, constraint, FK, indeks, RLS, owner fungsi, `search_path`, `proacl`, dan grants schema.
2. Dengan role `anon`, buktikan SELECT/INSERT/UPDATE/DELETE langsung pada empat tabel ditolak. Dengan `authenticated`, buktikan akses tabel dan EXECUTE RPC ditolak. Pastikan pelanggan A tidak dapat memperoleh pesanan B melalui REST tabel, RPC, atau nomor pesanan. Periksa juga bahwa fungsi privat tidak menjadi endpoint REST.
3. Tambahkan produk uji di database terisolasi. Panggil RPC sebagai `anon`: validasi satu pesanan, item dan pembayaran QRIS pending; hitung total snapshot. Ulangi dengan key dan payload sama, termasuk simulasi respons hilang, lalu pastikan jumlah baris tidak bertambah dan receipt sama. Ulangi dengan key sama dan payload berbeda, lalu pastikan konflik tanpa baris baru. Uji dua request serentak dengan key sama.
4. Uji produk tidak tersedia, ID tak dikenal, jumlah nol/negatif/desimal/terlalu besar, duplikasi ID, total/harga browser yang dimanipulasi, dan perubahan harga bersamaan; setiap kasus harus gagal tanpa baris pesanan, item, atau pembayaran baru.
5. Paksa satu penyisipan item gagal di database terisolasi (misalnya trigger uji sementara pada `order_items`), jalankan RPC, lalu pastikan tidak ada `orders`, `order_items`, atau `payments` yang tersisa. Hapus trigger uji setelahnya.
6. Uji bahwa `paid` tanpa admin dan waktu verifikasi ditolak. Setelah simulasi verifikasi admin yang sah di lingkungan terisolasi, replay key lama harus mengembalikan status terbaru tanpa membuat pesanan baru. Uji pula batas request dan lonjakan RPC anonim. Jangan gunakan data atau kredensial produksi dalam tes ini.

## Batas pengujian saat ini

Tes TypeScript/unit dan build menguji logika klien, validasi endpoint, bentuk permintaan RPC, serta penanganan respons tiruan. Tes itu **tidak membuktikan** eksekusi SQL, atomisitas transaksi, RLS produksi, atau penyimpanan pesanan nyata. Tidak ada migrasi atau pesanan uji yang dikirim ke proyek utama. Integrasi produksi baru dapat diklaim setelah persetujuan, penerapan migrasi, dan uji terisolasi yang disepakati.

## Di luar increment ini

Login dan dashboard admin, input pesanan kasir, perubahan status, verifikasi QRIS, pelacakan pesanan pelanggan, pembatalan, serta kebijakan pengembalian uang belum dibangun. Ketentuan transisi status pesanan masih menunggu keputusan pemilik kedai.
