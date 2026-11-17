/**
 * Margin API — accounts and planner sync, running on Cloudflare Workers with D1.
 *
 * Static files (the app) are served by Workers Assets; only /api/* reaches this
 * code (see `run_worker_first` in wrangler.jsonc).
 *
 *   POST /api/signup   { email, password }        create an account and sign in
 *   POST /api/login    { email, password }        sign in
 *   POST /api/logout                              end this session
 *   GET  /api/session                             { email } or 401
 *   GET  /api/data                                { revision, data }
 *   PUT  /api/data     { data, baseRevision }     save; 409 with the current copy if it changed meanwhile
 *
 * Sessions are random tokens in an HttpOnly cookie; only their SHA-256 hash is
 * stored. Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, the
 * Workers maximum) and a per-user salt.
 */

type Bytes = Uint8Array<ArrayBuffer>;

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const SESSION_COOKIE = 'margin_session';
const SESSION_DAYS = 60;
const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60_000;
const MAX_DATA_BYTES = 1_500_000;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      checkSameOrigin(request, url);
      await ensureSchema(env.DB);
      return await route(request, env, url.pathname);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong on the server. Please try again.' }, 500);
    }
  },
};

async function route(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  if (path === '/api/signup' && method === 'POST') return signup(request, env);
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return logout(request, env);
  if (path === '/api/session' && method === 'GET') {
    const user = await requireUser(request, env);
    return json({ email: user.email });
  }
  if (path === '/api/data' && method === 'GET') return getData(request, env);
  if (path === '/api/data' && method === 'PUT') return putData(request, env);
  throw new HttpError(404, 'Not found.');
}

// ───────────── Accounts ─────────────

async function signup(request: Request, env: Env): Promise<Response> {
  const { email, password } = await readCredentials(request);
  if (password.length < 8) throw new HttpError(400, 'Use a password with at least 8 characters.');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');

  const salt = randomBytes(16);
  const hash = await hashPassword(password, salt);
  const id = toBase64Url(randomBytes(12));
  try {
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, email, toBase64Url(hash), toBase64Url(salt), Date.now())
      .run();
  } catch {
    // Two sign-ups for the same email at once: the UNIQUE constraint caught the second.
    throw new HttpError(409, 'An account with that email already exists. Sign in instead.');
  }
  return startSession(env, id, email, 201);
}

async function login(request: Request, env: Env): Promise<Response> {
  const { email, password } = await readCredentials(request);
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, password_salt, failed_logins, locked_until FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; password_salt: string; failed_logins: number; locked_until: number }>();

  if (!user) {
    // Spend the same time as a real check so response timing doesn't reveal which emails exist.
    await hashPassword(password, randomBytes(16));
    throw new HttpError(401, 'That email and password don’t match an account.');
  }
  if (user.locked_until > Date.now()) {
    const minutes = Math.ceil((user.locked_until - Date.now()) / 60_000);
    throw new HttpError(429, `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const hash = await hashPassword(password, fromBase64Url(user.password_salt));
  if (!constantTimeEqual(hash, fromBase64Url(user.password_hash))) {
    const failed = user.failed_logins + 1;
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? Date.now() + LOCKOUT_MS : 0;
    await env.DB.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .bind(lockedUntil ? 0 : failed, lockedUntil, user.id)
      .run();
    throw new HttpError(401, 'That email and password don’t match an account.');
  }

  await env.DB.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').bind(user.id).run();
  return startSession(env, user.id, user.email, 200);
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

async function startSession(env: Env, userId: string, email: string, status: number): Promise<Response> {
  const token = toBase64Url(randomBytes(32));
  const now = Date.now();
  const maxAge = SESSION_DAYS * 86_400;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256(token),
      userId,
      now,
      now + maxAge * 1000,
    ),
    // Tidy up this user's expired sessions.
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(userId, now),
  ]);
  return json({ email }, status, { 'Set-Cookie': sessionCookie(token, maxAge) });
}

async function requireUser(request: Request, env: Env): Promise<{ id: string; email: string }> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) throw new HttpError(401, 'Please sign in.');
  const row = await env.DB.prepare(
    'SELECT users.id AS id, users.email AS email, sessions.expires_at AS expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?',
  )
    .bind(await sha256(token))
    .first<{ id: string; email: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, 'Your session has ended. Please sign in again.');
  return { id: row.id, email: row.email };
}

// ───────────── Planner data ─────────────

async function getData(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare('SELECT json, revision FROM planner_data WHERE user_id = ?')
    .bind(user.id)
    .first<{ json: string; revision: number }>();
  return json({ revision: row?.revision ?? 0, data: row ? JSON.parse(row.json) : null });
}

async function putData(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson<{ data?: unknown; baseRevision?: unknown }>(request, MAX_DATA_BYTES);
  const data = body.data as { courses?: unknown; assignments?: unknown } | undefined;
  if (!data || typeof data !== 'object' || !Array.isArray(data.courses) || !Array.isArray(data.assignments)) {
    throw new HttpError(400, 'That isn’t valid planner data.');
  }
  const base = Number(body.baseRevision);
  if (!Number.isInteger(base) || base < 0) throw new HttpError(400, 'Missing baseRevision.');

  const text = JSON.stringify(data);
  const now = Date.now();
  // Only write if nobody else saved since this client last synced (optimistic concurrency).
  const result =
    base === 0
      ? await env.DB.prepare('INSERT INTO planner_data (user_id, json, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING')
          .bind(user.id, text, now)
          .run()
      : await env.DB.prepare('UPDATE planner_data SET json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?')
          .bind(text, now, user.id, base)
          .run();

  if (result.meta.changes === 0) {
    const current = await env.DB.prepare('SELECT json, revision FROM planner_data WHERE user_id = ?')
      .bind(user.id)
      .first<{ json: string; revision: number }>();
    throw new HttpError(409, 'Your planner changed on another device.', {
      revision: current?.revision ?? 0,
      data: current ? JSON.parse(current.json) : null,
    });
  }
  return json({ revision: base + 1 });
}

// ───────────── Schema ─────────────

let schemaReady: Promise<unknown> | null = null;

function ensureSchema(db: D1Database): Promise<unknown> {
  schemaReady ??= db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          failed_logins INTEGER NOT NULL DEFAULT 0,
          locked_until INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )`,
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)'),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS planner_data (
          user_id TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          revision INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
      ),
    ])
    .catch((err) => {
      schemaReady = null; // retry on the next request
      throw err;
    });
  return schemaReady;
}

// ───────────── Helpers ─────────────

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Rejects cross-site writes: state-changing requests must come from this site, as JSON. */
function checkSameOrigin(request: Request, url: URL) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw new HttpError(403, 'Requests must come from this site.');
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new HttpError(415, 'Send JSON.');
  }
}

async function readJson<T>(request: Request, maxBytes = 10_000): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That’s too much data to save at once.');
  try {
    return JSON.parse(text || '{}') as T;
  } catch {
    throw new HttpError(400, 'Send valid JSON.');
  }
}

async function readCredentials(request: Request): Promise<{ email: string; password: string }> {
  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address.');
  if (!password) throw new HttpError(400, 'Enter your password.');
  if (password.length > 200) throw new HttpError(400, 'That password is too long.');
  return { email, password };
}

function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

async function hashPassword(password: string, salt: Bytes): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

async function sha256(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

function constantTimeEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toBase64Url(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Bytes {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
