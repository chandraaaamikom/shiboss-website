import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { localMenuImages } from '../src/lib/services/menu-images.ts';

const imageDirectory = fileURLToPath(new URL('../public/images/products/', import.meta.url));
const supportedFormats = new Set(['png', 'jpeg', 'webp', 'avif']);
const localPathPattern = /^\/images\/products\/[a-z0-9][a-z0-9-]*\.(png|jpe?g|webp|avif)$/;
const maxImageBytes = 15 * 1024 * 1024;
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:4321');

if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
  console.error('Alamat server audit tidak valid.');
  process.exit(1);
}

async function readLimited(response) {
  if (!response.ok || !response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
    throw new Error('Respons bukan gambar yang berhasil dimuat');
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxImageBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error('Ukuran gambar melebihi batas audit');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function decodesAsImage(source, expectedFormat) {
  const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
  const bytes = await readLimited(response);
  const metadata = await sharp(bytes).metadata();
  if (!supportedFormats.has(metadata.format) || !metadata.width || !metadata.height) return false;
  if (expectedFormat && metadata.format !== expectedFormat) return false;
  await sharp(bytes).raw().toBuffer();
  return true;
}

async function main() {
  const entries = Object.entries(localMenuImages);
  const mappedPaths = new Set();
  const mappingIssues = [];
  const ids = new Set();

  for (const [id, path] of entries) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) mappingIssues.push(`ID pemetaan tidak valid: ${id}`);
    if (!localPathPattern.test(path)) mappingIssues.push(`Jalur aset tidak valid untuk ID ${id}`);
    if (ids.has(id) || mappedPaths.has(path)) mappingIssues.push(`Pemetaan ganda untuk ID ${id}`);
    ids.add(id);
    mappedPaths.add(path);
  }

  const allFiles = await readdir(imageDirectory, { withFileTypes: true });
  const imageFiles = allFiles.filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(entry.name));
  const unmappedAssets = imageFiles.map((entry) => entry.name).filter((name) => !mappedPaths.has(`/images/products/${name}`));
  const unsupportedAssets = allFiles.filter((entry) => entry.isFile() && entry.name !== 'README.md' && !imageFiles.includes(entry)).map((entry) => entry.name);

  let apiResponse;
  try {
    apiResponse = await fetch(new URL('/api/menu', base), { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('API menu lokal tidak dapat dihubungi; jalankan server development atau preview lebih dulu.');
  }
  let menu;
  try {
    menu = await apiResponse.json();
  } catch {
    throw new Error(`API menu mengembalikan HTTP ${apiResponse.status} dengan respons bukan JSON.`);
  }
  if (apiResponse.status !== 200 || menu?.status !== 'ready' || !Array.isArray(menu.items)) {
    throw new Error(`API menu belum siap: HTTP ${apiResponse.status}, status ${String(menu?.status ?? 'tidak diketahui')}.`);
  }

  const productIds = new Set(menu.items.map((item) => item.id));
  const missingProductIds = entries.map(([id]) => id).filter((id) => !productIds.has(id));
  let validPhotos = 0;
  let noImageUrl = 0;
  let brokenPhotos = 0;
  let localPhotos = 0;
  let upstreamPhotos = 0;
  const brokenProducts = [];

  for (const item of menu.items) {
    const path = item.image_url;
    if (path == null) {
      noImageUrl++;
      continue;
    }
    if (typeof path !== 'string') {
      brokenPhotos++;
      brokenProducts.push(item.id);
      continue;
    }
    const isLocal = path.startsWith('/');
    let expectedFormat;
    if (isLocal) {
      const match = path.match(localPathPattern);
      if (!match) {
        brokenPhotos++;
        brokenProducts.push(item.id);
        continue;
      }
      expectedFormat = match[1] === 'jpg' ? 'jpeg' : match[1];
    } else if (!path.startsWith('https://')) {
      brokenPhotos++;
      brokenProducts.push(item.id);
      continue;
    }

    try {
      const source = isLocal ? new URL(path, base) : new URL(path);
      if (source.username || source.password || !(await decodesAsImage(source, expectedFormat))) throw new Error('Gambar tidak dapat didekode');
      validPhotos++;
      if (isLocal) localPhotos++;
      else upstreamPhotos++;
    } catch {
      brokenPhotos++;
      brokenProducts.push(item.id);
    }
  }

  console.log(JSON.stringify({
    apiHttpStatus: apiResponse.status,
    apiStatus: menu.status,
    totalMenu: menu.items.length,
    validPhotos,
    validLocalPhotos: localPhotos,
    validUpstreamPhotos: upstreamPhotos,
    withoutUsablePhoto: noImageUrl + brokenPhotos,
    noImageUrl,
    brokenPhotos,
    mappedLocalAssets: entries.length,
    unmappedAssets,
    unsupportedAssets,
    missingProductIds,
    mappingIssues,
    brokenProductIds: brokenProducts,
  }, null, 2));

  if (brokenPhotos || mappingIssues.length || unsupportedAssets.length || missingProductIds.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Audit foto gagal.');
  process.exitCode = 1;
});
