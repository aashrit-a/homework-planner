import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from '../types';
import { useStore } from './AppStore';
import { api, ApiError } from '../lib/api';
import { fingerprint, isEmptyData, mergeData } from '../lib/merge';
import { createEmptyData, normalizeData } from '../lib/storage';

/**
 * Account + sync.
 *
 * The planner always lives on the device (localStorage) first. When signed in,
 * it is also kept in the account on the server:
 *
 * - Edits upload a couple of seconds after you stop typing.
 * - Changes from other devices are picked up on focus, when coming back
 *   online, and every minute.
 * - If both sides changed, they are merged (see lib/merge.ts), never replaced.
 * - Before the first sign-in on a device, a backup of what's on it is saved.
 */

export type SyncStatus = 'signed_out' | 'synced' | 'syncing' | 'offline' | 'error';

interface SyncMeta {
  email: string | null;
  /** Server revision this device last saw. */
  revision: number;
  /** Fingerprint of the data at the last successful sync; anything else is unsynced. */
  syncedHash: string | null;
  lastSyncedAt: string | null;
}

export interface LocalBackup {
  savedAt: string;
  data: AppData;
}

interface AccountValue {
  /** False in builds without the API (the single-file hosted page). */
  available: boolean;
  email: string | null;
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  signIn(mode: 'login' | 'signup', email: string, password: string): Promise<void>;
  signOut(removeFromDevice: boolean): Promise<void>;
  syncNow(): Promise<void>;
  backup: LocalBackup | null;
}

const META_KEY = 'margin:account';
const BACKUP_KEY = 'margin:backup:before-sign-in';
const PUSH_DELAY_MS = 2000;
const PULL_INTERVAL_MS = 60_000;
const AVAILABLE = import.meta.env.VITE_HOSTED !== '1';

const EMPTY_META: SyncMeta = { email: null, revision: 0, syncedHash: null, lastSyncedAt: null };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: sync still works for this session */
  }
}

function loadBackup(): LocalBackup | null {
  const raw = readJson<{ savedAt?: string; data?: unknown }>(BACKUP_KEY);
  const data = raw?.data ? normalizeData(raw.data) : null;
  return raw?.savedAt && data ? { savedAt: raw.savedAt, data } : null;
}

const AccountContext = createContext<AccountValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { data, actions } = useStore();
  const dataRef = useRef(data);
  dataRef.current = data;

  const meta = useRef<SyncMeta>({ ...EMPTY_META, ...(AVAILABLE ? readJson<SyncMeta>(META_KEY) : null) });
  const [email, setEmail] = useState<string | null>(meta.current.email);
  const [status, setStatus] = useState<SyncStatus>(meta.current.email ? 'synced' : 'signed_out');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(meta.current.lastSyncedAt);
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<LocalBackup | null>(() => (AVAILABLE ? loadBackup() : null));

  const saveMeta = useCallback((patch: Partial<SyncMeta>) => {
    meta.current = { ...meta.current, ...patch };
    writeJson(META_KEY, meta.current.email ? meta.current : null);
    setEmail(meta.current.email);
    setLastSyncedAt(meta.current.lastSyncedAt);
  }, []);

  const signedOutLocally = useCallback(() => {
    saveMeta({ ...EMPTY_META });
    setStatus('signed_out');
  }, [saveMeta]);

  /** Puts data into the store immediately, merging in anything edited while a request was in flight. */
  const apply = useCallback(
    (snapshot: AppData, next: AppData): AppData => {
      const latest = dataRef.current;
      const result = latest === snapshot ? next : mergeData(latest, next);
      if (result !== latest) {
        actions.applyRemoteData(result);
        dataRef.current = result;
      }
      return result;
    },
    [actions],
  );

  const runSync = useCallback(async () => {
    if (!meta.current.email) return;
    setStatus('syncing');
    try {
      let remote = await api.getData();
      for (let attempt = 0; attempt < 4; attempt++) {
        const snapshot = dataRef.current;
        const dirty = fingerprint(snapshot) !== meta.current.syncedHash;
        const remoteData = remote.data ? normalizeData(remote.data) : null;

        let next: AppData;
        if (!remoteData) next = snapshot; // Empty account: this device's planner becomes the account's.
        else if (remote.revision === meta.current.revision && meta.current.syncedHash) next = snapshot; // Nothing new on the server.
        else next = dirty ? mergeData(snapshot, remoteData) : remoteData;

        const applied = apply(snapshot, next);
        const appliedHash = fingerprint(applied);
        const now = new Date().toISOString();

        if (remoteData && appliedHash === fingerprint(remoteData)) {
          saveMeta({ revision: remote.revision, syncedHash: appliedHash, lastSyncedAt: now });
          break;
        }
        try {
          const res = await api.putData(applied, remote.revision);
          saveMeta({ revision: res.revision, syncedHash: appliedHash, lastSyncedAt: now });
          break;
        } catch (err) {
          // Another device saved first: merge with its copy and try again.
          if (err instanceof ApiError && err.status === 409) {
            remote = { revision: Number(err.body.revision) || 0, data: err.body.data ?? null };
            continue;
          }
          throw err;
        }
      }
      setError(null);
      setStatus('synced');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session ended: keep everything on this device, just stop syncing.
        signedOutLocally();
        setError('You were signed out. Your planner is still on this device; sign in again to keep syncing.');
        return;
      }
      if (err instanceof ApiError && err.isNetwork) {
        setStatus('offline');
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Sync failed.');
    }
  }, [apply, saveMeta, signedOutLocally]);

  // One sync at a time; a request made during a sync runs once more afterwards.
  const running = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const syncNow = useCallback(async () => {
    if (running.current) {
      queued.current = true;
      return running.current;
    }
    const loop = async () => {
      do {
        queued.current = false;
        await runSync();
      } while (queued.current && meta.current.email);
    };
    running.current = loop().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [runSync]);

  // Upload a moment after local edits.
  useEffect(() => {
    if (!AVAILABLE || !meta.current.email) return;
    const t = setTimeout(() => {
      if (fingerprint(dataRef.current) !== meta.current.syncedHash) void syncNow();
    }, PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [data, email, syncNow]);

  // Pick up changes from other devices.
  useEffect(() => {
    if (!AVAILABLE || !email) return;
    void syncNow();
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    const onOnline = () => void syncNow();
    const timer = setInterval(() => document.visibilityState === 'visible' && void syncNow(), PULL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [email, syncNow]);

  // Flush unsynced edits when the tab is hidden (best effort).
  useEffect(() => {
    if (!AVAILABLE) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && meta.current.email && fingerprint(dataRef.current) !== meta.current.syncedHash) {
        void syncNow();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [syncNow]);

  const signIn = useCallback(
    async (mode: 'login' | 'signup', emailInput: string, password: string) => {
      const res = mode === 'signup' ? await api.signup(emailInput, password) : await api.login(emailInput, password);
      // Keep a copy of this device's planner exactly as it was before it met the account.
      const local = dataRef.current;
      if (!isEmptyData(local)) {
        const saved = { savedAt: new Date().toISOString(), data: local };
        writeJson(BACKUP_KEY, saved);
        setBackup(saved);
      }
      // syncedHash = null marks everything on this device as not yet in the account, so it gets merged in.
      saveMeta({ email: res.email, revision: 0, syncedHash: null, lastSyncedAt: null });
      setError(null);
      await syncNow();
    },
    [saveMeta, syncNow],
  );

  const signOut = useCallback(
    async (removeFromDevice: boolean) => {
      // Make sure the latest edits reach the account before leaving.
      if (fingerprint(dataRef.current) !== meta.current.syncedHash) await syncNow();
      try {
        await api.logout();
      } catch {
        /* offline: the session cookie is cleared server-side on next use or expiry */
      }
      signedOutLocally();
      setError(null);
      if (removeFromDevice) {
        actions.applyRemoteData({ ...createEmptyData(dataRef.current.settings), settingsUpdatedAt: dataRef.current.settingsUpdatedAt });
      }
    },
    [actions, signedOutLocally, syncNow],
  );

  // Confirm the stored session on load (the cookie may have expired).
  useEffect(() => {
    if (!AVAILABLE || !meta.current.email) return;
    api.session().catch((err) => {
      if (err instanceof ApiError && err.status === 401) signedOutLocally();
    });
  }, [signedOutLocally]);

  const value = useMemo<AccountValue>(
    () => ({ available: AVAILABLE, email, status, lastSyncedAt, error, signIn, signOut, syncNow, backup }),
    [email, status, lastSyncedAt, error, signIn, signOut, syncNow, backup],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
}
