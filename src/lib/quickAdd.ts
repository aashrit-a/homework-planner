import type { AssignmentType, Course, Priority } from '../types';
import { addDays, fromKey, toKey } from './date';

export interface QuickAddResult {
  title: string;
  courseId: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: Priority | null;
  type: AssignmentType | null;
  estimatedMinutes: number | null;
  /** Which tokens were recognised, for the live preview. */
  matched: { course?: string; date?: string; time?: string; priority?: string; estimate?: string };
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const TYPE_KEYWORDS: [RegExp, AssignmentType][] = [
  [/\b(midterm|final exam|exam|test)\b/i, 'test'],
  [/\bquiz\b/i, 'quiz'],
  [/\b(essay|paper)\b/i, 'essay'],
  [/\b(project|proposal|presentation)\b/i, 'project'],
  [/\b(read|reading|chapter|ch\.)\b/i, 'reading'],
  [/\b(problem set|pset|homework|hw|worksheet|lab)\b/i, 'homework'],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function matchCourse(token: string, courses: Course[]): Course | null {
  const t = norm(token);
  if (!t) return null;
  return (
    courses.find((c) => norm(c.code) === t || norm(c.name) === t) ??
    courses.find((c) => norm(c.code).startsWith(t) || norm(c.name).startsWith(t)) ??
    courses.find((c) => norm(c.code).includes(t) || norm(c.name).includes(t)) ??
    null
  );
}

function parseTime(token: string): string | null {
  const m = token.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3];
  if (!ampm && !m[2]) return null; // a bare number is ambiguous
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm.startsWith('p') && h !== 12) h += 12;
    if (ampm.startsWith('a') && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Parses a natural quick-add line such as
 * `Lab report #psyc fri 5pm !high ~2h`.
 */
export function parseQuickAdd(input: string, courses: Course[], now = new Date()): QuickAddResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const keep: string[] = [];
  const res: QuickAddResult = {
    title: '',
    courseId: null,
    dueDate: toKey(now),
    dueTime: null,
    priority: null,
    type: null,
    estimatedMinutes: null,
    matched: {},
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const tok = raw.toLowerCase();

    if (raw.startsWith('#') && raw.length > 1) {
      const c = matchCourse(raw.slice(1), courses);
      if (c) {
        res.courseId = c.id;
        res.matched.course = c.code || c.name;
        continue;
      }
    }
    if (tok.startsWith('!')) {
      const p = tok.slice(1);
      const pr: Priority | null = ['h', 'high', '1'].includes(p) ? 'high' : ['m', 'med', 'medium', '2'].includes(p) ? 'medium' : ['l', 'low', '3'].includes(p) ? 'low' : null;
      if (pr) {
        res.priority = pr;
        res.matched.priority = pr;
        continue;
      }
    }
    if (tok.startsWith('~')) {
      const m = tok.slice(1).match(/^(\d+(?:\.\d+)?)(h|hr|hrs|m|min|mins)?$/);
      if (m) {
        const n = Number(m[1]);
        const minutes = m[2]?.startsWith('m') ? n : n * 60;
        res.estimatedMinutes = Math.round(minutes);
        res.matched.estimate = tok.slice(1);
        continue;
      }
    }
    if (!res.matched.date) {
      if (tok === 'today' || tok === 'tod') {
        res.dueDate = toKey(today);
        res.matched.date = 'Today';
        continue;
      }
      if (tok === 'tomorrow' || tok === 'tmr' || tok === 'tmrw' || tok === 'tom') {
        res.dueDate = toKey(addDays(today, 1));
        res.matched.date = 'Tomorrow';
        continue;
      }
      const isNext = tok === 'next' && tokens[i + 1] && DAY_NAMES[tokens[i + 1].toLowerCase()] !== undefined;
      const dayTok = isNext ? tokens[i + 1].toLowerCase() : tok;
      if (DAY_NAMES[dayTok] !== undefined) {
        const target = DAY_NAMES[dayTok];
        let delta = (target - today.getDay() + 7) % 7;
        if (isNext) delta = delta === 0 ? 7 : delta + 7;
        res.dueDate = toKey(addDays(today, delta));
        res.matched.date = (isNext ? 'next ' : '') + dayTok;
        if (isNext) i++;
        continue;
      }
      const md = tok.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (md) {
        const m = Number(md[1]);
        const d = Number(md[2]);
        let y = md[3] ? Number(md[3]) : today.getFullYear();
        if (y < 100) y += 2000;
        const date = new Date(y, m - 1, d);
        if (date.getMonth() === m - 1 && date.getDate() === d) {
          if (!md[3] && date < today) date.setFullYear(y + 1);
          res.dueDate = toKey(date);
          res.matched.date = tok;
          continue;
        }
      }
    }
    if (!res.matched.time) {
      const prefixed = (tok === 'at' || tok === '@') && tokens[i + 1] ? parseTime(tokens[i + 1]) : null;
      const t = prefixed ?? parseTime(tok);
      if (t) {
        res.dueTime = t;
        res.matched.time = t;
        if (prefixed) i++;
        continue;
      }
    }
    keep.push(raw);
  }

  res.title = keep.join(' ').trim();
  for (const [re, type] of TYPE_KEYWORDS) {
    if (re.test(res.title)) {
      res.type = type;
      break;
    }
  }
  // Keep date sane if the user typed something odd.
  if (Number.isNaN(fromKey(res.dueDate).getTime())) res.dueDate = toKey(today);
  return res;
}
