import { useEffect, useState } from 'react';

/**
 * Minimal hash router using plain `#name` hashes (letters, digits, hyphens),
 * so links stay shareable on any static host or embedded viewer.
 *
 * Internally the app still speaks in paths like `/planner?day=2026-11-20`;
 * those are encoded to `#planner--day-2026-11-20`.
 */
export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

const PATH_TO_NAME: Record<string, string> = {
  '/': 'dashboard',
  '/assignments': 'assignments',
  '/tests': 'tests',
  '/planner': 'planner',
  '/calendar': 'calendar',
  '/classes': 'classes',
  '/study': 'study',
  '/settings': 'preferences',
};
const NAME_TO_PATH: Record<string, string> = Object.fromEntries(Object.entries(PATH_TO_NAME).map(([p, n]) => [n, p]));

const SAFE = /^[A-Za-z0-9-]*$/;

function toHex(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(h: string): string {
  const bytes = h.match(/../g)?.map((x) => parseInt(x, 16)) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes));
}
/** Values that are already hash-safe pass through; anything else is hex-encoded behind a `z` marker. */
function encodeVal(v: string): string {
  return SAFE.test(v) && !v.startsWith('z') ? v : `z${toHex(v)}`;
}
function decodeVal(v: string): string {
  return v.startsWith('z') && /^z([0-9a-f]{2})*$/.test(v) ? fromHex(v.slice(1)) : v;
}

export function encodePath(to: string): string {
  const [rawPath, qs = ''] = to.split('?');
  const path = '/' + rawPath.split('/').filter(Boolean).join('/');
  const segs = path.split('/').filter(Boolean);
  let name: string;
  if (segs[0] === 'classes' && segs[1]) {
    const id = segs[1];
    // Class ids look like `c_ab12cd`; drop the prefix for a readable `#class-ab12cd`.
    name = /^c_[A-Za-z0-9]+$/.test(id) && !id.startsWith('c_z') ? `class-${id.slice(2)}` : `class-${encodeVal(id)}`;
  }
  else name = PATH_TO_NAME[path] ?? 'dashboard';
  const params = [...new URLSearchParams(qs).entries()]
    .filter(([k]) => /^[A-Za-z0-9]+$/.test(k))
    .map(([k, v]) => `--${k}-${encodeVal(v)}`);
  return name + params.join('');
}

export function decodeName(hash: string): { path: string; query: URLSearchParams } {
  const raw = hash.replace(/^#/, '');
  // Accept legacy `#/path?query` links too.
  if (raw.startsWith('/')) {
    const [p, qs = ''] = raw.split('?');
    return { path: '/' + p.split('/').filter(Boolean).join('/'), query: new URLSearchParams(qs) };
  }
  const [name, ...pairs] = raw.split('--');
  const query = new URLSearchParams();
  for (const pair of pairs) {
    const i = pair.indexOf('-');
    if (i > 0) query.set(pair.slice(0, i), decodeVal(pair.slice(i + 1)));
  }
  let path = NAME_TO_PATH[name] ?? '/';
  if (name.startsWith('class-') && name.length > 6) {
    const v = name.slice(6);
    path = `/classes/${v.startsWith('z') ? decodeVal(v) : `c_${v}`}`;
  }
  return { path, query };
}

function parse(): Route {
  const { path, query } = decodeName(window.location.hash);
  return { path, segments: path.split('/').filter(Boolean), query };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  const target = `#${encodePath(to)}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export function href(to: string) {
  return `#${encodePath(to)}`;
}
