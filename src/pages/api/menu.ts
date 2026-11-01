import type { APIRoute } from 'astro';
import { loadMenu } from '../../lib/services/menu';

export const GET: APIRoute = async () => {
  const result = await loadMenu();

  return Response.json(result, {
    status: result.status === 'ready' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
