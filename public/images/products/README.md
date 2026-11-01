# Foto menu lokal

Foto dalam folder ini diekstrak tanpa perubahan visual dari `references/Menu FIX 23 June 2026.pdf`, menu Shiboss yang sudah tersedia dalam proyek. Pemetaan berdasarkan label foto di PDF dan ID produk yang dibaca dari API menu. Berkas ini tidak menggantikan `image_url` di database; URL valid dari Supabase selalu diprioritaskan oleh aplikasi.

| Halaman PDF | Foto produk yang dipasangkan |
| --- | --- |
| 1 | Americano, Roti Kapal, Original Es Teler |
| 2 | Milkshake Regal |
| 3 | Singkong Goreng, Nugget, Tempura, Otak-otak, Telur Gulung, Mendoan, French Fries, Sosis Ayam, Risol Smoke Beef, Pisang Goreng, Dimsum Ayam, Pentol Kriwil, Creamy Jasuke, Pisang Bakar, Sempol |
| 4 | Nasi Goreng Putih, Nasi Telur Nori |

Gambar varian tanpa label khusus, gambar gabungan, dan menu yang tidak memiliki foto jelas tidak dipetakan.

## Menambahkan foto berikutnya

1. Pastikan foto berasal dari sumber resmi/terverifikasi dan cocok dengan **satu produk tertentu**. Catat sumber dan persetujuan penggunaannya. Jangan menebak dari nama menu atau urutan hasil API.
2. Ambil `id` produk dari respons `/api/menu` (atau sumber data resmi lain) dan cocokkan nama serta kategori sebelum menambah pemetaan. ID menjadi kunci tunggal; nama hanya dipakai untuk pemeriksaan manusia.
3. Simpan berkas baru sebagai **`<id-produk>.<ekstensi>`** di folder ini, seluruhnya huruf kecil. Contoh bentuk: `00000000-0000-4000-8000-000000000001.webp`. Gunakan PNG, JPEG (`.jpg`/`.jpeg`), WebP, atau AVIF. Pastikan ekstensi sesuai isi berkas dan gambar dapat dibuka. Hindari SVG dan nama berkas yang berisi spasi, tanda tanya, atau parameter URL.
4. Tambahkan tepat satu baris `'<id-produk>': '/images/products/<nama-berkas>',` di `src/lib/services/menu-images.ts`. Pertahankan baris lama. Berkas 21 foto awal memakai nama deskriptif dari PDF dan tetap dipertahankan; aturan nama berbasis ID berlaku untuk berkas baru.
5. Jalankan server lokal, lalu `npm run audit:menu-images`. Skrip ini membaca `/api/menu`, mengambil dan mendekode gambar yang dilayani server, serta melaporkan foto valid, foto gagal, produk tanpa foto, ID pemetaan yang tidak ada di menu, dan berkas yang belum dipetakan. Periksa halaman `/menu` dan detail produk pada desktop serta seluler. Jalankan pula `npm run check`, `npm test`, dan `npm run build`.

URL `image_url` dari Supabase yang valid tetap didahulukan. Pemetaan lokal hanya fallback; menambah foto di sini tidak menulis ke database dan tidak memerlukan perubahan pada kartu produk. Jika URL atau berkas tidak dapat dimuat, antarmuka menampilkan placeholder. Skrip audit menguji keterbacaan dan dekode gambar, tetapi **kecocokan isi foto dengan produk tetap harus diperiksa manusia** berdasarkan sumbernya.
