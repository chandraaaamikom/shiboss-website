# Increment 4.1 — audit migrasi dan uji database terisolasi

Status: persiapan lokal. Tidak ada SQL dari dokumen ini yang dijalankan pada database produksi. `MENU_MUTATIONS_ENABLED` dan `ORDERS_ENABLED` harus tetap false selama seluruh uji.

## Bukti dan batasnya

Laporan audit produksi dari pemilik proyek menyatakan `public.menu_items` dan `public.profiles` ada dan RLS aktif; policy menu hanya membaca `is_available = true`; policy profil membaca profil admin sendiri; grant tulis menu belum ada; `orders`/`order_items` belum ditemukan; bucket dan policy Storage belum ada. Laporan itu belum memuat semua tipe/default/constraint kolom, teks lengkap policy, owner tabel, atribut `BYPASSRLS`, grant profil per kolom, atau fungsi yang mungkin mengubah profil. Jangan menganggap migrasi lokal membuktikan keadaan produksi.

Migrasi `202610270001_admin_menu_write.sql` sekarang berhenti sebelum perubahan jika tabel/RLS/skema dasar tidak cocok, policy tambahan sudah ada, role API mempunyai hak tulis lama, profil dapat ditulis oleh role API, atau role API memiliki `BYPASSRLS`/kepemilikan tabel. Guard ini adalah pembatas risiko, bukan pengganti audit hasil SQL produksi.

## Keamanan yang perlu dibuktikan

- Grant `INSERT`/`UPDATE` hanya untuk kolom nama, deskripsi, kategori, harga, dan ketersediaan kepada role `authenticated`; tidak ada grant/policy `DELETE`, Storage, atau perubahan policy baca publik dalam migrasi ini.
- Policy mutasi memerlukan profil dengan UID sama dengan `auth.uid()`, `role = 'admin'`, dan nama terisi. Profil hanya boleh ditulis operator tepercaya. Periksa juga RPC/fungsi lain yang mungkin mengubah `profiles`; guard grant tabel tidak mendeteksi fungsi `SECURITY DEFINER` yang sudah ada.
- `PATCH /api/admin/menu/:id` memvalidasi bentuk UUID dan memeriksa sesi/profil admin di server. Admin yang sah memang boleh mengedit semua menu; belum ada konsep pemilik per produk. Non-admin harus ditolak oleh middleware, handler, dan RLS.
- API memvalidasi field yang diizinkan, panjang, harga positif dua desimal, origin, tipe konten, dan batas body; pesan error tidak memuat detail database. Nama/kategori/deskripsi panjang maksimum saat ini ditegakkan oleh API, bukan oleh constraint tabel lokal; pemanggilan Data API langsung oleh admin dapat melewati batas panjang aplikasi.
- Kegagalan mengembalikan ID setelah operasi tulis bisa menjadi respons ambigu. Uji jalur ini dan jangan mengulangi POST secara otomatis; skema belum menyediakan idempotensi pembuatan menu.

## Lingkungan uji

Gunakan **instance PostgreSQL lokal khusus uji** versi 13 atau lebih baru, bukan sekadar database `shiboss_test` pada instance yang juga menampung produksi. Bootstrap membuat role `anon` dan `authenticated` pada tingkat cluster serta schema `auth` sintetis. Pengaman nama database dan alamat loopback di berkas SQL mengurangi salah target tetapi tidak membuktikan isolasi instance. Diperlukan `psql`, server PostgreSQL lokal di loopback, dan akun lokal yang dapat membuat role, schema, tabel, serta policy. Saat audit ini `psql`, Docker, dan Supabase CLI tidak tersedia, sehingga semua uji database di bawah **belum dijalankan**.

Jalankan melalui `psql` dengan `ON_ERROR_STOP=1`; berkas ini bukan suite pgTAP dan tidak boleh dijalankan melalui `supabase test db` secara otomatis. Buat database baru yang kosong bernama `shiboss_test` pada instance khusus uji. Di PowerShell, setelah `psql` tersedia dan operator lokal ditentukan:

```powershell
$TestDbUser = 'GANTI_DENGAN_USER_POSTGRES_LOKAL'
$Psql = 'psql'
$Db = 'shiboss_test'
& $Psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U $TestDbUser -d $Db -c 'select current_database(), inet_server_addr(), current_user;'
if ($LASTEXITCODE -ne 0) { throw 'Koneksi database uji gagal.' }
function Invoke-TestSql([string]$Path) {
  & $Psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U $TestDbUser -d $Db -f $Path
  if ($LASTEXITCODE -ne 0) { throw "Berhenti: $Path gagal." }
}
Invoke-TestSql 'supabase/tests/bootstrap_isolated.sql'
Invoke-TestSql 'supabase/tests/bootstrap_admin_menu_isolated.sql'
Invoke-TestSql 'supabase/migrations/202610240001_menu_items.sql'
Invoke-TestSql 'supabase/migrations/202610260001_admin_profiles_standalone.sql'
Invoke-TestSql 'supabase/migrations/202610270001_admin_menu_write.sql'
Invoke-TestSql 'supabase/tests/admin_menu_write_isolated.sql'
```

Fungsi di atas berhenti jika satu perintah gagal. Operator tetap harus memastikan instance PostgreSQL benar-benar khusus uji sebelum menjalankannya. Berkas tes terakhir memakai data sintetis dalam transaksi yang di-`ROLLBACK`.

## Matriks hasil yang diharapkan

| Skenario | Hasil yang diharapkan |
| --- | --- |
| `anon` membaca menu aktif / nonaktif | Aktif terlihat; nonaktif tidak terlihat. |
| `anon` menambah, mengubah, atau menghapus menu | Ditolak oleh privilege/RLS. |
| `authenticated` tanpa profil admin membaca menu | Hanya aktif terlihat. |
| `authenticated` tanpa profil admin menambah/mengubah/menghapus | Ditolak; perubahan nol baris tidak boleh dianggap berhasil. |
| Admin membaca dan menambah menu | Menu aktif dan nonaktif terlihat; tambah menghasilkan ID. |
| Admin mengedit harga dan `is_available=false` | Baris berubah; menu nonaktif hilang dari baca publik. |
| Harga negatif, perubahan `image_url`, update profil, hapus menu | Ditolak oleh constraint atau privilege. |

Tes SQL lokal memakai `auth.uid()` tiruan dengan klaim sesi sintetis. Untuk bukti akhir, ulangi pengujian pada **proyek Supabase terisolasi** melalui Auth dan Data API nyata: pengunjung, akun non-admin, dan admin; uji POST/PATCH, respons error, sesi kedaluwarsa, serta pembacaan publik. Jangan gunakan akun atau menu produksi. Periksa juga bahwa policy Storage tidak berubah dan `MENU_MUTATIONS_ENABLED` tetap false pada lingkungan produksi.

## Gerbang sebelum meminta persetujuan produksi

1. Hasil audit baca-saja produksi menunjukkan tipe/default/constraint menu, grant profil, seluruh policy, owner tabel, role `BYPASSRLS`, dan fungsi terkait profil sesuai asumsi migrasi.
2. Migrasi dan matriks RLS lulus pada PostgreSQL terisolasi. Uji end-to-end Supabase terisolasi juga lulus, termasuk penolakan anon/non-admin dan baca publik.
3. SQL final ditinjau ulang terhadap hasil aktual; tidak ada grant/policy tak terduga, tidak ada DELETE, dan jalur order tetap nonaktif.
4. Pemilik proyek memberikan persetujuan terpisah sebelum migrasi produksi. Flag mutasi baru boleh diaktifkan setelah verifikasi pascamigrasi.
