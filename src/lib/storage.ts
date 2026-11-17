import type { AppData, Assignment, AssignmentType, Course, Priority, Settings, Status, StudyPlan, StudyTopic } from '../types';
import { isValidKey, isValidTime } from './date';
import { CLASS_COLORS } from './constants';
import { uid } from './id';

/**
 * Persistence boundary. The app only talks to this interface, so a remote
 * implementation (REST API + auth) can replace `LocalStorageAdapter` later
 * without touching UI code.
 */
export interface PersistenceAdapter {
  load(): AppData | null;
  save(data: AppData): void;
  clear(): void;
  /** Subscribe to changes made elsewhere (other tabs, server push). */
  subscribe?(onChange: (data: AppData) => void): () => void;
}

export const STORAGE_KEY = 'margin:data:v1';
const DEMO_REMOVED_KEY = 'margin:demo-removed';

/** Ids used by the demo semester that earlier versions created on first launch. */
const DEMO_COURSE_IDS = new Set(['c_cs201', 'c_math221', 'c_psyc101', 'c_engl205', 'c_econ102']);
const isDemoAssignmentId = (id: string) => /^a_seed\d+$/.test(id);

/**
 * Removes the old demo classes and assignments. Demo classes that the user's
 * own assignments still use are kept. Returns the same object if nothing changed.
 */
export function removeDemoData(data: AppData): AppData {
  const assignments = data.assignments.filter((a) => !isDemoAssignmentId(a.id));
  const usedCourses = new Set(assignments.map((a) => a.courseId));
  const courses = data.courses.filter((c) => !DEMO_COURSE_IDS.has(c.id) || usedCourses.has(c.id));
  if (assignments.length === data.assignments.length && courses.length === data.courses.length) return data;
  const kept = new Set(assignments.map((a) => a.id));
  const studyPlan: StudyPlan = {};
  for (const [day, ids] of Object.entries(data.studyPlan)) {
    const list = ids.filter((id) => kept.has(id));
    if (list.length) studyPlan[day] = list;
  }
  // The demo also set the name "Alex".
  const settings = data.settings.userName === 'Alex' ? { ...data.settings, userName: '' } : data.settings;
  return { ...data, assignments, courses, studyPlan, settings };
}

/** Timestamp for data that predates change tracking: any real edit is newer. */
export const EPOCH = '1970-01-01T00:00:00.000Z';
const TOMBSTONE_TTL_MS = 180 * 86_400_000;

export function createEmptyData(settings: Settings = DEFAULT_SETTINGS): AppData {
  return {
    version: 1,
    courses: [],
    assignments: [],
    settings: { ...settings },
    studyPlan: {},
    settingsUpdatedAt: EPOCH,
    planUpdatedAt: EPOCH,
    deleted: {},
  };
}

function normalizeDeleted(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === 'string' && !Number.isNaN(Date.parse(at)) && Date.parse(at) > cutoff) out[id] = at;
  }
  return out;
}

export class LocalStorageAdapter implements PersistenceAdapter {
  constructor(private key = STORAGE_KEY) {}

  load(): AppData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const data = normalizeData(JSON.parse(raw));
      if (data && !localStorage.getItem(DEMO_REMOVED_KEY)) {
        // Earlier versions seeded a demo semester; clear it out once, keeping anything the user added.
        const cleaned = removeDemoData(data);
        localStorage.setItem(DEMO_REMOVED_KEY, '1');
        if (cleaned !== data) this.save(cleaned);
        return cleaned;
      }
      return data;
    } catch {
      return null;
    }
  }

  save(data: AppData): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (err) {
      console.error('Margin: failed to save data', err);
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }

  subscribe(onChange: (data: AppData) => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key !== this.key || !e.newValue) return;
      try {
        const data = normalizeData(JSON.parse(e.newValue));
        if (data) onChange(data);
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  theme: 'system',
  dailyStudyGoalMinutes: 180,
  plannerShowCompleted: true,
};

const PRIORITY_SET = new Set<Priority>(['low', 'medium', 'high']);
const STATUS_SET = new Set<Status>(['not_started', 'in_progress', 'completed']);
const TYPE_SET = new Set<AssignmentType>(['homework', 'quiz', 'test', 'project', 'essay', 'reading', 'other']);

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function normalizeCourse(raw: any, i: number): Course | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name).trim();
  if (!name) return null;
  return {
    id: str(raw.id) || uid('c_'),
    name,
    code: str(raw.code),
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : CLASS_COLORS[i % CLASS_COLORS.length],
    teacher: str(raw.teacher),
    createdAt: str(raw.createdAt) || EPOCH,
    updatedAt: str(raw.updatedAt) || str(raw.createdAt) || EPOCH,
  };
}

function normalizeTopics(raw: unknown): StudyTopic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && typeof (t as any).text === 'string')
    .map((t) => ({ id: str(t.id) || uid('t_'), text: (t.text as string).trim().slice(0, 200), done: t.done === true }))
    .filter((t) => t.text)
    .slice(0, 100);
}

function normalizeAssignment(raw: any, courseIds: Set<string>): Assignment | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title).trim();
  if (!title || !isValidKey(raw.dueDate)) return null;
  const now = new Date().toISOString();
  const status: Status = STATUS_SET.has(raw.status) ? raw.status : 'not_started';
  const est = Number(raw.estimatedMinutes);
  return {
    id: str(raw.id) || uid('a_'),
    title,
    courseId: typeof raw.courseId === 'string' && courseIds.has(raw.courseId) ? raw.courseId : null,
    notes: str(raw.notes),
    dueDate: raw.dueDate,
    dueTime: isValidTime(raw.dueTime) ? raw.dueTime : null,
    estimatedMinutes: Number.isFinite(est) && est > 0 ? Math.round(est) : null,
    priority: PRIORITY_SET.has(raw.priority) ? raw.priority : 'medium',
    type: TYPE_SET.has(raw.type) ? raw.type : 'homework',
    status,
    location: str(raw.location).slice(0, 120),
    topics: normalizeTopics(raw.topics),
    completedAt: status === 'completed' ? str(raw.completedAt) || now : null,
    createdAt: str(raw.createdAt) || now,
    updatedAt: str(raw.updatedAt) || now,
  };
}

/**
 * Validates and repairs data from storage or an imported backup. Unknown
 * fields are dropped, missing fields get defaults. Returns null if the
 * payload is not recognisable as Margin data.
 */
export function normalizeData(raw: any): AppData | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.assignments) || !Array.isArray(raw.courses)) {
    return null;
  }
  const courses = raw.courses.map(normalizeCourse).filter(Boolean) as Course[];
  const courseIds = new Set(courses.map((c) => c.id));
  const assignments = raw.assignments
    .map((a: unknown) => normalizeAssignment(a, courseIds))
    .filter(Boolean) as Assignment[];
  const assignmentIds = new Set(assignments.map((a) => a.id));

  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings: Settings = {
    userName: str(s.userName, DEFAULT_SETTINGS.userName),
    theme: ['light', 'dark', 'system'].includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    dailyStudyGoalMinutes:
      Number.isFinite(s.dailyStudyGoalMinutes) && s.dailyStudyGoalMinutes > 0
        ? Math.round(s.dailyStudyGoalMinutes)
        : DEFAULT_SETTINGS.dailyStudyGoalMinutes,
    plannerShowCompleted:
      typeof s.plannerShowCompleted === 'boolean' ? s.plannerShowCompleted : DEFAULT_SETTINGS.plannerShowCompleted,
  };

  const studyPlan: StudyPlan = {};
  if (raw.studyPlan && typeof raw.studyPlan === 'object') {
    for (const [day, ids] of Object.entries(raw.studyPlan)) {
      if (!isValidKey(day) || !Array.isArray(ids)) continue;
      const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && assignmentIds.has(id)))];
      if (clean.length) studyPlan[day] = clean;
    }
  }

  return {
    version: 1,
    courses,
    assignments,
    settings,
    studyPlan,
    settingsUpdatedAt: str(raw.settingsUpdatedAt) || EPOCH,
    planUpdatedAt: str(raw.planUpdatedAt) || EPOCH,
    deleted: normalizeDeleted(raw.deleted),
  };
}

export function serializeBackup(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function backupFileName(d = new Date()): string {
  return `margin-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
}

/** Starts a file download. Some embedded viewers block downloads; callers should also offer copy. */
export function exportData(data: AppData): void {
  const blob = new Blob([serializeBackup(data)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readImportFile(file: File): Promise<AppData> {
  return parseBackupText(await file.text());
}

export function parseBackupText(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That backup is not valid JSON. Paste the whole file, from the first { to the last }.');
  }
  const data = normalizeData(parsed);
  if (!data) throw new Error('That does not look like a Margin backup. Export one from Settings first.');
  return data;
}
