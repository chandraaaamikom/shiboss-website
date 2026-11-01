export interface AdminIdentity {
  id: string;
  email: string;
  fullName: string;
}

export function adminEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function isAdminProfile(value: unknown, userId: string): value is { id: string; full_name: string; role: 'admin' } {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return profile.id === userId && profile.role === 'admin'
    && typeof profile.full_name === 'string' && profile.full_name.trim().length > 0;
}

export function isSameOriginForm(request: Request): boolean {
  const origin = request.headers.get('Origin');
  const type = request.headers.get('Content-Type') ?? '';
  const length = Number(request.headers.get('Content-Length') ?? '0');
  return origin === new URL(request.url).origin
    && type.toLowerCase().startsWith('application/x-www-form-urlencoded')
    && Number.isFinite(length) && length <= 4096;
}

export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
