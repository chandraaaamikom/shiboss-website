# Profil admin mandiri — rencana penerapan dan pengujian

**Status:** SQL lokal, belum diterapkan ke Supabase utama. `ADMIN_ENABLED` dan
`ORDERS_ENABLED` tetap nonaktif. Jangan memakai `supabase db push` untuk hanya
mengaktifkan login: perintah itu dapat menjalankan migrasi pesanan lama yang
masih tertunda. Tinjau dan terapkan berkas
`supabase/migrations/202610260001_admin_profiles_standalone.sql` secara
terpisah hanya setelah pengujian terisolasi dan persetujuan pemilik proyek.

## Kontrak aplikasi

`src/lib/admin/supabase.ts` dan endpoint login membaca kolom `id`,
`full_name`, dan `role` dari `public.profiles`. `id` harus sama dengan UID
Supabase Auth pengguna; `full_name` tidak boleh kosong; `role` harus `admin`.
Kolom `created_at` mempertahankan bentuk migrasi lama, tetapi tidak dibaca
oleh aplikasi. Akun Auth saja tidak memberikan akses dashboard.

Migrasi mandiri membuat hanya `public.profiles`. RLS aktif, `anon` tidak
mendapat hak tabel, dan `authenticated` hanya mendapat `SELECT` untuk tiga
kolom yang dibaca aplikasi. Policy mengizinkan pengguna membaca hanya
profilnya sendiri dengan peran admin. Tidak ada `INSERT`, `UPDATE`, atau
`DELETE` untuk klien. Migrasi tidak membuat pengguna, profil awal, tabel
pesanan, pembayaran, fungsi RPC, atau kebijakan Storage.

## Pengujian pada proyek Supabase terisolasi

1. Siapkan proyek Supabase khusus uji yang berbeda dari proyek utama. Jangan
   menyalin data maupun kredensial produksi. Periksa skema awal dengan
   `select to_regclass('public.profiles');`.
2. Di SQL Editor proyek uji, terapkan **hanya** migrasi mandiri, lalu periksa
   struktur dan hak akses menggunakan SQL baca-saja berikut:

   ```sql
   select to_regclass('public.profiles') as table_name;
   select a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
          a.attnotnull
   from pg_catalog.pg_attribute a
   where a.attrelid = 'public.profiles'::regclass
     and a.attnum > 0 and not a.attisdropped
   order by a.attnum;
   select c.conname, pg_catalog.pg_get_constraintdef(c.oid) as definition
   from pg_catalog.pg_constraint c
   where c.conrelid = 'public.profiles'::regclass;
   select c.relrowsecurity
   from pg_catalog.pg_class c where c.oid = 'public.profiles'::regclass;
   select has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_select,
          has_table_privilege('authenticated', 'public.profiles', 'INSERT') as auth_insert,
          has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as auth_update,
          has_table_privilege('authenticated', 'public.profiles', 'DELETE') as auth_delete,
          has_column_privilege('authenticated', 'public.profiles', 'id', 'SELECT') as auth_id_select,
          has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT') as auth_name_select,
          has_column_privilege('authenticated', 'public.profiles', 'role', 'SELECT') as auth_role_select;
   select policyname, roles, cmd, qual
   from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'profiles';
   ```

   Harapan: empat kolom sesuai migrasi, PK/FK/check tersedia, RLS `true`,
   `anon_select` dan semua hak tulis `false`, tiga hak baca kolom `true`,
   serta hanya policy baca profil admin sendiri.
3. Buat dua akun Auth **sintetis** A dan B di proyek uji. Operator tepercaya
   menambahkan profil admin untuk keduanya menggunakan UID asli dari proyek
   uji; jangan memberi klien hak menulis profil. Tambahkan akun C tanpa
   profil sebagai uji penolakan.
4. Dengan sesi Auth A, panggil Data API `profiles?select=id,full_name,role`
   dan pastikan hanya A terlihat, termasuk ketika filter sengaja meminta
   UID B. Ulangi dari sesi B untuk membuktikan isolasi dua arah. Sesi C
   harus mendapat hasil kosong; tanpa sesi tidak boleh memperoleh profil.
5. Dari sesi A, coba `INSERT`, `UPDATE role`, dan `DELETE` terhadap profil.
   Semua harus ditolak oleh grant/RLS. Coba baca kolom `created_at`; klien
   tidak diberi hak baca kolom itu. Jangan menyimpulkan aman hanya dari
   query SQL Editor sebagai pemilik tabel; uji juga request nyata memakai
   sesi `authenticated` dan publishable key proyek uji.
6. Uji login, refresh cookie, akses `/admin`, penolakan akun C, dan logout
   dengan aplikasi yang diarahkan **hanya** ke proyek uji. Aktivasi flag
   dalam lingkungan uji membutuhkan persetujuan terpisah; jangan mengubah
   `.env` proyek utama sebagai bagian dari prosedur ini.

## Prosedur operator pada proyek utama — belum disetujui

1. Sebelum perubahan, jalankan lagi `select to_regclass('public.profiles');`
   dan tinjau pengaturan **Integrations → Data API**. Endpoint
   `public.menu_items` yang sudah merespons membuktikan skema `public`
   tersedia bagi aplikasi saat audit, tetapi tidak membuktikan hak akses
   `profiles` setelah tabel dibuat.
2. Setelah SQL dan hasil uji terisolasi disetujui, terapkan **hanya** berkas
   migrasi mandiri melalui SQL Editor pada proyek yang benar. Jangan jalankan
   migrasi pesanan lama hanya untuk membuka login. Jalankan query pemeriksaan
   struktur dan hak akses di atas lagi.
3. Di **Authentication → Users**, salin UID akun admin yang telah dibuat.
   Operator tepercaya memverifikasi identitas pemilik akun, lalu memasukkan
   satu baris `profiles` dengan UID tersebut, nama sebenarnya, dan peran
   `admin` melalui SQL Editor atau prosedur provisioning yang ditinjau.
   Jangan meminta UID/password dikirim melalui chat dan jangan memberi
   `authenticated` hak `INSERT` atau `UPDATE` ke tabel ini.

   Template SQL berikut **belum dijalankan**. Ganti kedua penanda dengan UID
   Auth dan nama sebenarnya setelah izin perubahan data diberikan. Jika UID
   tidak ditemukan atau profil sudah ada, transaksi gagal tanpa membuat
   profil lain.

   ```sql
   begin;
   do $$
   declare
     v_uid uuid := 'ISI_UID_AUTH_ASLI'::uuid;
     v_full_name text := 'ISI_NAMA_ADMIN_ASLI';
   begin
     if not exists (select 1 from auth.users where id = v_uid) then
       raise exception 'UID Auth tidak ditemukan';
     end if;
     insert into public.profiles (id, full_name, role)
     values (v_uid, v_full_name, 'admin');
   end;
   $$;
   commit;
   ```

4. Periksa bahwa baris profil cocok dengan UID Auth dan bahwa akun lain tidak
   dapat membacanya. Baru setelah pengujian login aman disetujui, setel
   `ADMIN_ENABLED=true` pada lingkungan server dan restart layanan.
   `ORDERS_ENABLED` tetap `false`.

Migrasi lama `202610250001_customer_orders.sql` masih memuat tabel pesanan dan
RPC anonim, serta `202610250002_admin_profile_read.sql` masih policy bacanya.
Keduanya telah dibuat kompatibel secara lokal dengan profil mandiri, tetapi
tetap memerlukan audit dan persetujuan terpisah sebelum diterapkan.
