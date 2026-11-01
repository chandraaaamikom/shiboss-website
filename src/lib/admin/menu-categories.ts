export const MENU_CATEGORIES = [
  'Food',
  'Milkshake',
  'Minuman Lainnya',
  'Snack',
  'Special Susu',
  'Tambahan',
  'Varian Telur',
] as const;

export function isMenuCategory(value: string): boolean {
  return MENU_CATEGORIES.some((category) => category === value);
}
