import type { Assignment, Course } from '../types';
import { PRIORITY_WEIGHT } from './constants';
import { diffDays, dueDateTime, startOfWeek, toKey, addDays, todayKey, timeUntil } from './date';

export const isDone = (a: Assignment) => a.status === 'completed';

export function isOverdue(a: Assignment, now = new Date()): boolean {
  return !isDone(a) && dueDateTime(a.dueDate, a.dueTime).getTime() < now.getTime();
}

/** Due within 48 hours and not complete. */
export function isUrgent(a: Assignment, now = new Date()): boolean {
  if (isDone(a)) return false;
  const ms = dueDateTime(a.dueDate, a.dueTime).getTime() - now.getTime();
  return ms >= 0 && ms <= 48 * 3_600_000;
}

export function compareByDue(a: Assignment, b: Assignment): number {
  const d = dueDateTime(a.dueDate, a.dueTime).getTime() - dueDateTime(b.dueDate, b.dueTime).getTime();
  if (d !== 0) return d;
  return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
}

export function compareByPriority(a: Assignment, b: Assignment): number {
  return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || compareByDue(a, b);
}

export interface ScoredAssignment {
  assignment: Assignment;
  score: number;
  reason: string;
  tone: 'danger' | 'warning' | 'neutral';
}

/**
 * Urgency score used by the Study Planner. Combines time-to-deadline,
 * priority, the weight of the assignment type and whether it is already
 * underway. Larger work due soon is pulled forward because it needs a head
 * start.
 */
export function scoreAssignment(a: Assignment, now = new Date()): ScoredAssignment {
  const due = dueDateTime(a.dueDate, a.dueTime);
  const hours = (due.getTime() - now.getTime()) / 3_600_000;
  const est = (a.estimatedMinutes ?? 60) / 60;

  let urgency: number;
  if (hours < 0) urgency = 100;
  else if (hours <= 24) urgency = 70;
  else if (hours <= 48) urgency = 50;
  else if (hours <= 72) urgency = 35;
  else if (hours <= 168) urgency = 20;
  else urgency = Math.max(0, 10 - hours / 72);

  // Big tasks need lead time: if remaining hours are tight relative to effort, bump.
  if (hours > 0 && est >= 2 && hours < est * 12) urgency += 12;

  const typeBoost = a.type === 'test' || a.type === 'project' ? 6 : a.type === 'quiz' || a.type === 'essay' ? 3 : 0;
  const progressBoost = a.status === 'in_progress' ? 4 : 0;
  const score = urgency + PRIORITY_WEIGHT[a.priority] * 9 + typeBoost + progressBoost;

  let reason: string;
  let tone: ScoredAssignment['tone'] = 'neutral';
  if (hours < 0) {
    reason = `Overdue · ${timeUntil(due, now).replace(' ago', '')} late`;
    tone = 'danger';
  } else if (hours <= 24) {
    reason = `Due ${timeUntil(due, now)}`;
    tone = 'danger';
  } else if (hours <= 72) {
    reason = `Due ${timeUntil(due, now)}`;
    tone = 'warning';
  } else if (a.priority === 'high') {
    reason = 'High priority';
  } else {
    reason = `Due ${timeUntil(due, now)}`;
  }
  if (hours > 0 && est >= 2 && hours < est * 12 && tone !== 'danger') {
    reason = `Big task · ${reason.toLowerCase()}`;
    tone = 'warning';
  }
  return { assignment: a, score, reason, tone };
}

export function rankForStudy(assignments: Assignment[], now = new Date()): ScoredAssignment[] {
  return assignments
    .filter((a) => !isDone(a))
    .map((a) => scoreAssignment(a, now))
    .sort((x, y) => y.score - x.score || compareByDue(x.assignment, y.assignment));
}

export interface DueBuckets {
  overdue: Assignment[];
  today: Assignment[];
  tomorrow: Assignment[];
  thisWeek: Assignment[];
  nextWeek: Assignment[];
  later: Assignment[];
  completed: Assignment[];
}

export function bucketByDue(assignments: Assignment[], now = new Date()): DueBuckets {
  const today = toKey(now);
  const weekEnd = toKey(addDays(startOfWeek(now), 6));
  const nextWeekEnd = toKey(addDays(startOfWeek(now), 13));
  const b: DueBuckets = { overdue: [], today: [], tomorrow: [], thisWeek: [], nextWeek: [], later: [], completed: [] };
  for (const a of assignments) {
    if (isDone(a)) b.completed.push(a);
    else if (isOverdue(a, now)) b.overdue.push(a);
    else if (a.dueDate === today) b.today.push(a);
    else if (diffDays(today, a.dueDate) === 1) b.tomorrow.push(a);
    else if (a.dueDate <= weekEnd) b.thisWeek.push(a);
    else if (a.dueDate <= nextWeekEnd) b.nextWeek.push(a);
    else b.later.push(a);
  }
  return b;
}

export function weekRangeKeys(ref = new Date()): [string, string] {
  const s = startOfWeek(ref);
  return [toKey(s), toKey(addDays(s, 6))];
}

export function courseMap(courses: Course[]): Map<string, Course> {
  return new Map(courses.map((c) => [c.id, c]));
}

export function sumMinutes(list: Assignment[]): number {
  return list.reduce((t, a) => t + (a.estimatedMinutes ?? 0), 0);
}

export { todayKey };
