import type { Assignment, AssignmentType } from '../types';
import { diffDays, dueDateTime, timeUntil, toKey } from './date';
import { compareByDue, isDone } from './planning';

export const TEST_TYPES: AssignmentType[] = ['test', 'quiz'];

export const isTestType = (type: AssignmentType) => TEST_TYPES.includes(type);
export const isTest = (a: Assignment) => isTestType(a.type);

/** Tests and quizzes not yet taken whose date is today or later, soonest first. */
export function upcomingTests(assignments: Assignment[], now = new Date()): Assignment[] {
  const today = toKey(now);
  return assignments.filter((a) => isTest(a) && !isDone(a) && a.dueDate >= today).sort(compareByDue);
}

/** Tests already taken or whose date has passed, most recent first. */
export function pastTests(assignments: Assignment[], now = new Date()): Assignment[] {
  const today = toKey(now);
  return assignments
    .filter((a) => isTest(a) && (isDone(a) || a.dueDate < today))
    .sort((a, b) => compareByDue(b, a));
}

export function prepProgress(a: Assignment): { done: number; total: number; pct: number } {
  const total = a.topics.length;
  const done = a.topics.filter((t) => t.done).length;
  return { done, total, pct: total ? done / total : 0 };
}

export interface Countdown {
  /** Large figure, e.g. "3" or "Today". */
  value: string;
  /** Unit or detail under the figure, e.g. "days" or "in 5h". */
  unit: string;
  /** One-line form, e.g. "in 3 days". */
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
}

export function countdown(a: Assignment, now = new Date()): Countdown {
  const days = diffDays(toKey(now), a.dueDate);
  if (days <= 0) {
    const at = dueDateTime(a.dueDate, a.dueTime);
    const detail = a.dueTime ? (at > now ? timeUntil(at, now) : 'started') : 'today';
    return { value: 'Today', unit: detail, label: a.dueTime ? `Today, ${detail}` : 'Today', tone: 'danger' };
  }
  if (days === 1) return { value: '1', unit: 'day', label: 'Tomorrow', tone: 'danger' };
  return { value: String(days), unit: 'days', label: `in ${days} days`, tone: days <= 7 ? 'warning' : 'neutral' };
}
