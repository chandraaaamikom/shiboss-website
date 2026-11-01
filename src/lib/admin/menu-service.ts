import type { SupabaseClient } from '@supabase/supabase-js';
import type { MenuItem, MenuResult } from '../../types/menu';
import { parseMenuRows } from '../validation/menu';
import { localMenuImageFor } from '../services/menu-images';
import type { MenuWritePort, MenuWriteInput } from './menu-mutations';

const columns = 'id,name,description,category,price,image_url,is_available';

export async function loadAdminMenu(client: SupabaseClient): Promise<MenuResult> {
  const items: MenuItem[] = [];
  try {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('menu_items').select(columns)
        .order('category').order('name').order('id').range(offset, offset + 499);
      if (error || !data) return { status: 'error', items: [] };
      items.push(...parseMenuRows(data).map((item) => ({
        ...item, image_url: item.image_url ?? localMenuImageFor(item.id),
      })));
      if (data.length < 500) break;
    }
    return { status: 'ready', items };
  } catch {
    return { status: 'error', items: [] };
  }
}

export function adminMenuWritePort(client: SupabaseClient): MenuWritePort {
  return {
    async insert(input: MenuWriteInput) {
      const { data, error } = await client.from('menu_items').insert(input).select('id').single();
      return { id: data?.id, error: Boolean(error) };
    },
    async update(id: string, input: MenuWriteInput) {
      const { data, error } = await client.from('menu_items').update(input).eq('id', id).select('id').maybeSingle();
      return { id: data?.id, error: Boolean(error) };
    },
  };
}
