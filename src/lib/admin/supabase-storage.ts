import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_SECRET_KEY,
  SUPABASE_URL,
} from 'astro:env/server';

export function createAdminSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SERVER_CREDENTIALS_MISSING');
  }

  let endpoint: URL;

  try {
    endpoint = new URL(SUPABASE_URL);

    if (endpoint.protocol !== 'https:') {
      throw new Error('INVALID_SUPABASE_URL');
    }
  } catch {
    throw new Error('INVALID_SUPABASE_URL');
  }

  if (!SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    throw new Error('INVALID_SUPABASE_SECRET_KEY');
  }

  return createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}