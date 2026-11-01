# Shiboss Website

Increment 1 menyediakan fondasi Astro dan menu digital baca-saja. Produk diambil dari tabel `menu_items` Supabase dan hanya item dengan `is_available = true` yang ditampilkan.

## Pengembangan lokal

1. Salin `.env.example` menjadi `.env` dan isi URL serta anon/publishable key Supabase.
2. Jalankan `npm install`.
3. Jalankan `npm run dev`.

Migrasi dalam `supabase/migrations/` disiapkan untuk ditinjau dan belum dijalankan ke database mana pun.
