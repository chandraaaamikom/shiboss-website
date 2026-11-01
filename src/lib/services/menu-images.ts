// These IDs were matched to individually labelled photos in the local Shiboss menu PDF.
// Supabase image_url always takes precedence over this read-only local fallback.
export const localMenuImages: Readonly<Record<string, string>> = Object.freeze({
  '00e458f4-7933-474b-9fe5-cc4d133f4cc5': '/images/products/americano.png',
  '5ef04f84-a386-4e32-8078-4de0e128e267': '/images/products/roti-kapal.png',
  '0e9bf8b4-2880-4de0-b096-721e48ce0f19': '/images/products/original-es-teler.png',
  '42626a4b-ff37-4af1-a04d-da59d67c444a': '/images/products/milkshake-regal.png',
  '08a66f19-605f-431d-86de-733389c89dc2': '/images/products/singkong-goreng.png',
  '31f8af62-dd48-4f92-b5b8-96edf17a8997': '/images/products/nugget.png',
  'a395302f-dc3e-43eb-bb3f-1407a59d76bc': '/images/products/tempura.png',
  'd7786b18-25bc-4612-8978-bb3530aaa440': '/images/products/otak-otak.png',
  '2bc44c6f-60e3-4be5-8c43-4ad2e19f9a8f': '/images/products/telur-gulung.png',
  '065992c8-16d1-4e0b-9049-dc09a90b9dc6': '/images/products/mendoan.png',
  'fb1d3036-f3d8-4dcb-ba01-7227a4a65435': '/images/products/french-fries.png',
  'ebb910f3-3496-4ffa-a647-a91c3cd36d66': '/images/products/sosis-ayam.png',
  'f0e624a2-f8e6-4d99-9cf7-6b683717e4d2': '/images/products/risol-smoke-beef.png',
  'f3d2dec4-809d-4eff-851b-50e27b622310': '/images/products/pisang-goreng.png',
  '653c56a2-e73c-4dc4-bf37-cb3191feff61': '/images/products/dimsum-ayam.png',
  '41fb701a-9a2f-4205-9233-d9a5388555b2': '/images/products/pentol-kriwil.png',
  'ad0dbdf8-e076-4567-bf6a-f44e0d075880': '/images/products/creamy-jasuke.png',
  '7833557b-d192-41df-bc42-95a0efbbca05': '/images/products/pisang-bakar.png',
  'ce49b912-f4af-4192-a98f-9c7b21e9f89a': '/images/products/sempol.png',
  'fc652cb8-91a1-49e6-a1fc-b8976c653988': '/images/products/nasi-goreng-putih.png',
  '9ba66e24-e5be-4bc9-801e-7d34e7f59788': '/images/products/nasi-telur-nori.png',
});

export function localMenuImageFor(id: string): string | null {
  return localMenuImages[id] ?? null;
}
