import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from 'astro:env/server';
import type { MenuResult } from '../../types/menu.ts';
import { loadMenuFrom } from './menu-core.ts';

export function loadMenu(): Promise<MenuResult> {
  return loadMenuFrom({ url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY });
}
