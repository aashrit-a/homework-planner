import type { AppData, Assignment, AssignmentType, Course, Priority, Settings, Status, StudyPlan } from '../types';
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

export class LocalStorageAdapter implements PersistenceAdapter {
  constructor(private key = STORAGE_KEY) {}

  load(): AppData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return normalizeData(JSON.parse(raw));
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
    createdAt: str(raw.createdAt) || new Date().toISOString(),
  };
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

  return { version: 1, courses, assignments, settings, studyPlan };
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
