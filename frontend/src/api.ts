import type { Claim, Item, ItemDetail, ItemList, Me, Meta, NewItem } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

const BACKEND_DOWN =
  'The Lost & Found service is not answering right now. Your data is safe; try again in a moment.';

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection and try again.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (!data && [502, 503, 504].includes(response.status)) {
      throw new ApiError(response.status, 'backend_down', BACKEND_DOWN);
    }
    throw new ApiError(
      response.status,
      data?.error ?? 'error',
      data?.message ?? `Request failed with status ${response.status}.`,
      data?.fields ?? {},
    );
  }
  return data as T;
}

export interface ListParams {
  q?: string;
  type?: string;
  category?: string;
  location?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: ListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== null) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  me: () => request<Me>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  health: () => request<{ status: string; database: string }>('/health'),
  meta: () => request<Meta>('/meta'),
  listItems: (params: ListParams) => request<ItemList>(`/items${toQuery(params)}`),
  getItem: (id: number | string) => request<ItemDetail>(`/items/${id}`),
  createItem: (item: NewItem) => request<{ item: Item }>('/items', { method: 'POST', body: item }),
  resolveItem: (id: number) => request<{ item: Item }>(`/items/${id}/resolve`, { method: 'POST' }),
  createClaim: (id: number, message: string) =>
    request<{ claim: Claim }>(`/items/${id}/claims`, { method: 'POST', body: { message } }),
  claimAction: (claimId: number, action: 'accept' | 'reject' | 'cancel') =>
    request<{ claim: Claim }>(`/claims/${claimId}/${action}`, { method: 'POST' }),
  myItems: () => request<{ items: Item[] }>('/me/items'),
  myClaims: () => request<{ claims: Claim[] }>('/me/claims'),
};
