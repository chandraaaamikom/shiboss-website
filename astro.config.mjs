
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      ORDERS_ENABLED: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_ENABLED: envField.string({ context: 'server', access: 'secret', optional: true }),
      MENU_MUTATIONS_ENABLED: envField.string({ context: 'server', access: 'secret', optional: true }),
      MENU_UPLOAD_ENABLED: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
