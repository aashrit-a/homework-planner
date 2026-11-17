import type { AppData } from '../types';
import { normalizeData } from './storage';

/**
 * Combines two copies of the planner (e.g. this device and the account) so
 * nothing either side added is lost:
 *
 * - Classes and assignments are matched by id; when both sides changed the
 *   same item, the more recent edit wins.
 * - A deletion wins over any edit made before it, and is remembered so the
 *   item can't come back on the next merge.
 * - Settings and the study plan come from whichever side changed them last.
 */
export function mergeData(local: AppData, remote: AppData): AppData {
  const deleted: Record<string, string> = { ...remote.deleted };
  for (const [id, at] of Object.entries(local.deleted)) {
    if (!deleted[id] || at > deleted[id]) deleted[id] = at;
  }

  const isDeleted = (item: { id: string; updatedAt: string }) => {
    const at = deleted[item.id];
    return at !== undefined && at >= item.updatedAt;
  };

  function mergeLists<T extends { id: string; updatedAt: string }>(mine: T[], theirs: T[]): T[] {
    const byId = new Map<string, T>();
    // Remote order first (it's what other devices see), then anything only this device has.
    for (const item of theirs) byId.set(item.id, item);
    for (const item of mine) {
      const other = byId.get(item.id);
      if (!other || item.updatedAt > other.updatedAt) byId.set(item.id, item);
    }
    return [...byId.values()].filter((item) => !isDeleted(item));
  }

  const courses = mergeLists(local.courses, remote.courses);
  const assignments = mergeLists(local.assignments, remote.assignments);
  // A deletion that lost to a later edit is no longer needed.
  for (const item of [...courses, ...assignments]) delete deleted[item.id];

  const settingsFromLocal = local.settingsUpdatedAt > remote.settingsUpdatedAt;
  const planFromLocal = local.planUpdatedAt > remote.planUpdatedAt;

  const merged = normalizeData({
    version: 1,
    courses,
    assignments,
    settings: settingsFromLocal ? local.settings : remote.settings,
    settingsUpdatedAt: settingsFromLocal ? local.settingsUpdatedAt : remote.settingsUpdatedAt,
    studyPlan: planFromLocal ? local.studyPlan : remote.studyPlan,
    planUpdatedAt: planFromLocal ? local.planUpdatedAt : remote.planUpdatedAt,
    deleted,
  });
  // normalizeData only returns null for unrecognisable input, which can't happen here.
  return merged!;
}

/** True when the planner has nothing in it (no classes or assignments). */
export function isEmptyData(data: AppData): boolean {
  return data.courses.length === 0 && data.assignments.length === 0;
}

/** Short fingerprint of the data, used to tell whether anything changed since the last sync. */
export function fingerprint(data: AppData): string {
  // Normalising first gives a canonical key order, so equal data always hashes the same.
  const text = JSON.stringify(normalizeData(data) ?? data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${text.length.toString(36)}-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}
