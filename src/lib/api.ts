/** Thin client for the Worker API in worker/index.ts. The session lives in an HttpOnly cookie. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** No response at all: offline, or the server isn't reachable. */
  get isNetwork() {
    return this.status === 0;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.');
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = await res.json();
  } catch {
    // A non-JSON response means this isn't the Margin API (e.g. a static host without the Worker).
    if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('json')) {
      throw new ApiError(0, 'Accounts aren’t available on this version of the site.');
    }
  }
  if (!res.ok) throw new ApiError(res.status, String(parsed.error ?? `Request failed (${res.status}).`), parsed);
  return parsed as T;
}

export const api = {
  signup: (email: string, password: string) => request<{ email: string }>('POST', '/api/signup', { email, password }),
  login: (email: string, password: string) => request<{ email: string }>('POST', '/api/login', { email, password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout', {}),
  session: () => request<{ email: string }>('GET', '/api/session'),
  getData: () => request<{ revision: number; data: unknown }>('GET', '/api/data'),
  putData: (data: unknown, baseRevision: number) => request<{ revision: number }>('PUT', '/api/data', { data, baseRevision }),
};
