import { isMenuCategory } from './menu-categories.ts';

export interface MenuWriteInput {
  name: string;
  category: string;
  description: string | null;
  price: number;
  is_available: boolean;
}

export type MenuWriteResult =
  | { status: 'ready'; message: string; id: string }
  | { status: 'invalid' | 'forbidden' | 'unavailable' | 'not_found'; message: string };

export interface MenuWritePort {
  insert(input: MenuWriteInput): Promise<{ id?: string; error?: boolean }>;
  update(id: string, input: MenuWriteInput): Promise<{ id?: string; error?: boolean }>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedFields = new Set(['name', 'category', 'description', 'price', 'is_available']);

export function parseMenuWriteInput(value: unknown): MenuWriteInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== allowedFields.size || Object.keys(row).some((key) => !allowedFields.has(key))) return null;
  if (typeof row.name !== 'string' || typeof row.category !== 'string'
    || typeof row.price !== 'number' || typeof row.is_available !== 'boolean'
    || (row.description !== null && typeof row.description !== 'string')) return null;
  const name = row.name.trim();
  const category = row.category.trim();
  const description = row.description?.trim() || null;
  if (!name || name.length > 120 || !isMenuCategory(category)
    || (description && description.length > 500)
    || !Number.isSafeInteger(row.price) || row.price < 1_000
    || row.price > 9_999_999_999 || row.price % 1_000 !== 0) return null;
  return { name, category, description, price: row.price, is_available: row.is_available };
}

export async function processMenuMutation(args: {
  enabled: boolean;
  access: 'authorized' | 'unauthenticated' | 'forbidden' | 'unavailable' | 'disabled';
  mode: 'create' | 'edit';
  id?: string;
  input: unknown;
  port?: MenuWritePort;
}): Promise<MenuWriteResult> {
  if (args.access !== 'authorized') return {
    status: args.access === 'forbidden' ? 'forbidden' : 'unavailable',
    message: 'Akses admin tidak tersedia.',
  };
  if (!args.enabled || !args.port) return { status: 'unavailable', message: 'Penyimpanan menu belum diaktifkan.' };
  if (args.mode === 'edit' && (!args.id || !uuid.test(args.id))) return { status: 'invalid', message: 'ID menu tidak valid.' };
  const input = parseMenuWriteInput(args.input);
  if (!input) return { status: 'invalid', message: 'Periksa nama, kategori, deskripsi, harga, dan ketersediaan.' };
  try {
    const result = args.mode === 'create' ? await args.port.insert(input) : await args.port.update(args.id!, input);
    if (result.error) return { status: 'unavailable', message: 'Menu belum dapat disimpan. Coba lagi.' };
    if (!result.id) return { status: 'not_found', message: 'Menu tidak ditemukan atau tidak dapat diubah.' };
    return { status: 'ready', message: args.mode === 'create' ? 'Menu berhasil ditambahkan.' : 'Menu berhasil diperbarui.', id: result.id };
  } catch {
    return { status: 'unavailable', message: 'Menu belum dapat disimpan. Coba lagi.' };
  }
}

