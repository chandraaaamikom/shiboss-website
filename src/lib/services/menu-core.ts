import type { MenuItem, MenuResult } from '../../types/menu.ts';
import { parseMenu } from '../validation/menu.ts';
import { localMenuImageFor } from './menu-images.ts';

type MenuResponse = Pick<Response, 'ok' | 'status' | 'json'>;
type MenuFetcher = (input: URL, init: RequestInit) => Promise<MenuResponse>;

export type MenuDiagnostic =
  | 'configuration_unavailable'
  | 'configuration_invalid'
  | 'http_unauthorized'
  | 'http_forbidden'
  | 'table_not_found'
  | 'network_error'
  | 'upstream_http_error'
  | 'response_invalid_json'
  | 'response_invalid_data';

type DiagnosticContext = Readonly<Record<string, string | number>>;

export interface MenuLogger {
  error(diagnostic: MenuDiagnostic, context?: DiagnosticContext): void;
}

const serverLogger: MenuLogger = {
  error(diagnostic, context = {}) {
    console.error('[menu-service]', { diagnostic, ...context });
  },
};

export interface MenuDependencies {
  url?: string;
  key?: string;
  fetcher?: MenuFetcher;
  logger?: MenuLogger;
}

export async function loadMenuFrom(dependencies: MenuDependencies): Promise<MenuResult> {
  const { url, key, fetcher = fetch, logger = serverLogger } = dependencies;
  if (!url || !key) {
    logger.error('configuration_unavailable');
    return { status: 'unconfigured', items: [] };
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    logger.error('configuration_invalid', { reason: 'publishable_key_format' });
    return { status: 'error', items: [] };
  }

  let endpoint: URL;
  try {
    const base = new URL(url);
    if (base.protocol !== 'https:') throw new Error('Invalid configuration');

    endpoint = new URL('/rest/v1/menu_items', base);
    endpoint.search = new URLSearchParams({
      select: 'id,name,description,category,price,image_url,is_available',
      is_available: 'eq.true',
      order: 'category.asc,name.asc,id.asc',
    }).toString();
  } catch {
    logger.error('configuration_invalid');
    return { status: 'error', items: [] };
  }

  const items: MenuItem[] = [];
  for (let offset = 0; ; offset += 500) {
    endpoint.searchParams.set('offset', String(offset));
    endpoint.searchParams.set('limit', '500');

    let response: MenuResponse;
    try {
      response = await fetcher(endpoint, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      const reason = error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'request_failed';
      logger.error('network_error', { reason });
      return { status: 'error', items: [] };
    }

    if (!response.ok) {
      const errorBody = await readJson(response);
      const postgrestCode = readPostgrestCode(errorBody);

      if (response.status === 401) logger.error('http_unauthorized', { http_status: 401 });
      else if (response.status === 403) logger.error('http_forbidden', { http_status: 403 });
      else if (postgrestCode === 'PGRST205') {
        logger.error('table_not_found', { http_status: response.status, postgrest_code: 'PGRST205' });
      } else {
        const context: Record<string, string | number> = { http_status: response.status };
        if (postgrestCode) context.postgrest_code = postgrestCode;
        logger.error('upstream_http_error', context);
      }
      return { status: 'error', items: [] };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      logger.error('response_invalid_json');
      return { status: 'error', items: [] };
    }

    try {
      items.push(...parseMenu(raw).map((item) => ({
        ...item,
        image_url: item.image_url ?? localMenuImageFor(item.id),
      })));
    } catch {
      logger.error('response_invalid_data');
      return { status: 'error', items: [] };
    }

    if (Array.isArray(raw) && raw.length < 500) break;
  }

  return { status: 'ready', items };
}

async function readJson(response: MenuResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readPostgrestCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const code = (value as Record<string, unknown>).code;
  if (typeof code !== 'string' || !/^[A-Z0-9_]{3,20}$/.test(code)) return null;
  return code;
}
