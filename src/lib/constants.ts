import type { AssignmentType, Priority, Status } from '../types';

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

export const STATUS_LABEL: Record<Status, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const TYPES: { value: AssignmentType; label: string }[] = [
  { value: 'homework', label: 'Homework' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'test', label: 'Test' },
  { value: 'project', label: 'Project' },
  { value: 'essay', label: 'Essay' },
  { value: 'reading', label: 'Reading' },
  { value: 'other', label: 'Other' },
];

export const TYPE_LABEL: Record<AssignmentType, string> = Object.fromEntries(
  TYPES.map((t) => [t.value, t.label]),
) as Record<AssignmentType, string>;

export const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 360];

/** Class colors tuned to read well on both light and dark surfaces. */
export const CLASS_COLORS = [
  '#5b5bd6', // indigo
  '#3e8ef7', // blue
  '#0d9488', // teal
  '#16a34a', // green
  '#ca8a04', // amber
  '#ea580c', // orange
  '#e5484d', // red
  '#d6409f', // pink
  '#8e4ec6', // purple
  '#64748b', // slate
  '#0891b2', // cyan
  '#a16207', // brown
];

export const NO_CLASS_COLOR = '#9ca3af';
