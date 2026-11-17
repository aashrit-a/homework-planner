import type { AssignmentType, Course, Priority } from '../types';
import { addDays, startOfWeek, toKey } from './date';

/**
 * Natural-language quick add.
 *
 *   Essay draft due at 11:50pm tomorrow high priority
 *   math homework due friday at 5pm, takes 2 hours
 *   "Lab report" for organic chemistry next tuesday
 *   biology midterm in 2 weeks at 9am
 *
 * Phrases for the date, time, priority, effort and class are recognised and
 * removed; what is left becomes the title. The older shorthand (#class,
 * !high, ~2h) still works.
 */
export interface QuickAddResult {
  title: string;
  courseId: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: Priority | null;
  type: AssignmentType | null;
  estimatedMinutes: number | null;
  /** What was recognised, for the live preview. */
  matched: { course?: string; date?: string; time?: string; priority?: string; estimate?: string };
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, few: 3,
};

const TYPE_KEYWORDS: [RegExp, AssignmentType][] = [
  [/\b(midterm|final|finals|exam|test)\b/i, 'test'],
  [/\bquiz\b/i, 'quiz'],
  [/\b(essay|paper)\b/i, 'essay'],
  [/\b(project|proposal|presentation)\b/i, 'project'],
  [/\b(read|reading|chapter|ch\.)\b/i, 'reading'],
  [/\b(problem set|pset|homework|hw|worksheet|lab)\b/i, 'homework'],
];

/** Words never treated as a class abbreviation. */
const STOPWORDS = new Set(
  'the and for due with this that next from into over about before after test quiz exam essay read lab paper homework project final study notes write draft review practice problem set chapter page pages week day days today tonight tomorrow'.split(' '),
);

/** Words in class names too generic to identify a class on their own. */
const GENERIC_NAME_WORDS = new Set(['intro', 'introduction', 'advanced', 'principles', 'fundamentals', 'general', 'topics', 'applied', 'modern', 'seminar', 'special', 'elementary', 'basic']);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (s: string) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()] ?? NaN);

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Fix common misspellings of date words ("tomrorow", "wendesday") before parsing. */
function correctTypos(text: string): string {
  const targets = ['tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'tonight', 'priority'];
  return text.replace(/[A-Za-z]{5,}/g, (w) => {
    const lw = w.toLowerCase();
    if (targets.includes(lw)) return w;
    for (const t of targets) {
      if (Math.abs(t.length - lw.length) <= 2 && lw[0] === t[0] && levenshtein(lw, t) <= 2) return t;
    }
    return w;
  });
}

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

/** Ways a class can be written in a sentence, longest first: full name, code, code subject ("math"). */
function courseAliases(c: Course): string[] {
  const out = new Set<string>();
  if (c.name.trim()) out.add(c.name.trim());
  const code = c.code.trim();
  if (code) {
    out.add(code);
    const m = code.match(/^([A-Za-z]{2,})\s*-?\s*(\d+[A-Za-z]?)$/);
    if (m) {
      out.add(`${m[1]} ${m[2]}`);
      out.add(`${m[1]}${m[2]}`);
      out.add(m[1]);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

const aliasPattern = (alias: string) => escapeRe(alias).replace(/\\?\s+/g, '\\s*');

function parseClock(h: number, min: number, meridiem: string | undefined): string | null {
  if (min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    const pm = meridiem.toLowerCase().startsWith('p');
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseQuickAdd(input: string, courses: Course[], now = new Date()): QuickAddResult {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const res: QuickAddResult = {
    title: '',
    courseId: null,
    dueDate: toKey(today),
    dueTime: null,
    priority: null,
    type: null,
    estimatedMinutes: null,
    matched: {},
  };

  let text = ` ${input.trim()} `;
  let quoted: string | null = null;

  // A quoted title is taken literally.
  text = text.replace(/["“”]([^"“”]+)["“”]/, (_, t: string) => {
    quoted = t.trim();
    return ' ';
  });
  text = correctTypos(text);

  /** Finds the first match, lets `fn` accept it, and cuts it out of the text. */
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (!m || m.index === undefined) return false;
    if (fn(m) === false) return false;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    return true;
  };
  const setDate = (d: Date, label: string) => {
    res.dueDate = toKey(d);
    res.matched.date = label;
  };

  // ── Priority ──
  const PRIORITY: Record<string, Priority> = { high: 'high', top: 'high', urgent: 'high', medium: 'medium', med: 'medium', normal: 'medium', low: 'low' };
  take(/[\s,]*(?:\b(?:with|at|set to)\s+)?\b(high|top|medium|med|normal|low)[\s-]+priority\b|[\s,]*\bpriority\s*(?:is\s+|:\s*|of\s+|=\s*)?(high|medium|med|normal|low)\b/i, (m) => {
    res.priority = PRIORITY[(m[1] ?? m[2]).toLowerCase()];
  }) ||
    take(/[\s,]*\b(urgent|asap|important)\b/i, () => {
      res.priority = 'high';
    }) ||
    take(/(?:^|\s)!(high|h|1|medium|med|m|2|low|l|3)\b/i, (m) => {
      const v = m[1].toLowerCase();
      res.priority = ['high', 'h', '1'].includes(v) ? 'high' : ['low', 'l', '3'].includes(v) ? 'low' : 'medium';
    });
  if (res.priority) res.matched.priority = res.priority;

  // ── Effort ──
  take(/(?:^|\s)~(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b/i, (m) => {
    const n = Number(m[1]);
    res.estimatedMinutes = Math.round(m[2].toLowerCase().startsWith('h') ? n * 60 : n);
  }) ||
    take(/[\s,]*\b(?:it\s+)?(?:will\s+|should\s+)?(?:takes?|need(?:s)?|about|around|roughly|approx(?:imately)?|est(?:imated)?|for)\s+(?:about\s+|around\s+|roughly\s+)?(half an hour|an hour and a half|\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|couple of|few)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i, (m) => {
      const phrase = m[1].toLowerCase();
      let minutes: number;
      if (phrase === 'half an hour') minutes = 30;
      else if (phrase === 'an hour and a half') minutes = 90;
      else {
        const n = num(phrase.replace(/ of$/, ''));
        if (!Number.isFinite(n)) return false;
        minutes = m[2].toLowerCase().startsWith('h') ? n * 60 : n;
      }
      res.estimatedMinutes = Math.round(minutes);
    });
  if (res.estimatedMinutes) res.matched.estimate = `${res.estimatedMinutes}m`;

  // ── Time of day ──
  const setTime = (t: string | null, label: string) => {
    if (!t) return false;
    res.dueTime = t;
    res.matched.time = label;
  };
  take(/\b(?:at|by|@|before|due)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=[\s,.!?]|$)/i, (m) =>
    setTime(parseClock(Number(m[1]), Number(m[2] ?? 0), m[3].replace(/\./g, '')), m[0].trim()),
  ) ||
    take(/\b(?:at|by|@|before)?\s*\b(noon|midday|midnight|end of (?:the )?day|eod)\b/i, (m) => {
      const w = m[1].toLowerCase();
      return setTime(w === 'noon' || w === 'midday' ? '12:00' : '23:59', w);
    }) ||
    take(/\b(?:at|by|@|before)?\s*\b([01]?\d|2[0-3]):([0-5]\d)\b/i, (m) => setTime(parseClock(Number(m[1]), Number(m[2]), undefined), m[0].trim())) ||
    take(/\b(?:at|by|@)\s+(\d{1,2})\b(?!\s*(?:\/|days?|weeks?|hours?|hrs?|minutes?|mins?|th|st|nd|rd))/i, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return false;
      // "at 5" on a deadline almost always means the afternoon.
      return setTime(parseClock(h, 0, h <= 7 || h === 12 ? 'pm' : 'am'), m[0].trim());
    }) ||
    take(/\b(?:in the |this )?(morning|afternoon|evening)\b/i, (m) => {
      const w = m[1].toLowerCase();
      return setTime(w === 'morning' ? '09:00' : w === 'afternoon' ? '15:00' : '18:00', w);
    });

  // ── Date ──
  const cue = '(?:(?:due|on|by|before|until|for)\\s+)?';
  const dateFound =
    take(new RegExp(`\\b${cue}(?:the\\s+)?day after tomorrow\\b`, 'i'), () => setDate(addDays(today, 2), 'day after tomorrow')) ||
    take(new RegExp(`\\b${cue}(today|tonight|tod)\\b`, 'i'), (m) => setDate(today, m[1].toLowerCase() === 'tonight' ? 'tonight' : 'today')) ||
    take(new RegExp(`\\b${cue}(tomorrow|tmrw|tmr|tmw|tomoz)\\b`, 'i'), () => setDate(addDays(today, 1), 'tomorrow')) ||
    take(/\b(?:due\s+)?in\s+(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few)\s+(days?|weeks?)\b/i, (m) => {
      const n = num(m[1].replace(/^a (couple of|few)$/i, '$1').replace(/ of$/, ''));
      if (!Number.isFinite(n)) return false;
      const days = m[2].toLowerCase().startsWith('w') ? n * 7 : n;
      setDate(addDays(today, days), `in ${days} day${days === 1 ? '' : 's'}`);
    }) ||
    take(new RegExp(`\\b${cue}next week\\b`, 'i'), () => setDate(addDays(startOfWeek(today), 7), 'next week')) ||
    take(new RegExp(`\\b${cue}(?:the\\s+)?end of (?:the\\s+|this\\s+)?week\\b`, 'i'), () => {
      const fri = addDays(startOfWeek(today), 4);
      setDate(fri < today ? addDays(fri, 7) : fri, 'end of week');
    }) ||
    take(new RegExp(`\\b${cue}(?:this\\s+)?weekend\\b`, 'i'), () => {
      const sat = addDays(startOfWeek(today), 5);
      setDate(sat < today ? addDays(sat, 7) : sat, 'this weekend');
    }) ||
    // Weekdays. Full names always count; "sat"/"sun" need a cue word ("on sat") to avoid the SAT exam.
    take(
      /\b(?:(?:due|on|by|before|until)\s+)?(?:(this|next|coming)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|weds|wed|thurs|thur|thu|fri)\b|\b(?:due|on|by|before|until|this|next)\s+(sat|sun)\b/i,
      (m) => {
        const which = m[1]?.toLowerCase();
        const target = WEEKDAYS[(m[2] ?? m[3]).toLowerCase()];
        let d: Date;
        if (which === 'next') {
          // "next friday" = the Friday of next week.
          d = addDays(startOfWeek(today), 7 + ((target + 6) % 7));
        } else {
          d = addDays(today, (target - today.getDay() + 7) % 7);
        }
        setDate(d, `${which === 'next' ? 'next ' : ''}${(m[2] ?? m[3]).toLowerCase()}`);
      },
    ) ||
    take(
      new RegExp(`\\b${cue}(${Object.keys(MONTHS).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'),
      (m) => setMonthDay(MONTHS[m[1].toLowerCase()], Number(m[2]), m[3] ? Number(m[3]) : null, m[0].trim()),
    ) ||
    take(
      new RegExp(`\\b${cue}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${Object.keys(MONTHS).join('|')})\\b`, 'i'),
      (m) => setMonthDay(MONTHS[m[2].toLowerCase()], Number(m[1]), null, m[0].trim()),
    ) ||
    take(new RegExp(`\\b${cue}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b`, 'i'), (m) => {
      let y = m[3] ? Number(m[3]) : null;
      if (y !== null && y < 100) y += 2000;
      return setMonthDay(Number(m[1]) - 1, Number(m[2]), y, m[0].trim());
    }) ||
    take(new RegExp(`\\b${cue}the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`, 'i'), (m) => {
      const day = Number(m[1]);
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d.getDate() !== day) return false;
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
      setDate(d, `the ${day}`);
    });

  function setMonthDay(month: number, day: number, year: number | null, label: string) {
    if (month < 0 || month > 11 || day < 1 || day > 31) return false;
    const y = year ?? today.getFullYear();
    let d = new Date(y, month, day);
    if (d.getMonth() !== month) return false;
    if (year === null && d < today) d = new Date(y + 1, month, day);
    setDate(d, label);
    return true;
  }

  // A time that has already passed today, with no date given, means tomorrow.
  if (!dateFound && res.dueTime) {
    const [h, mi] = res.dueTime.split(':').map(Number);
    if (h * 60 + mi <= now.getHours() * 60 + now.getMinutes()) setDate(addDays(today, 1), 'tomorrow');
  }

  // ── Class ──
  const legacy = text.match(/(?:^|\s)#(\S+)/);
  if (legacy) {
    const c = matchCourse(legacy[1], courses);
    if (c) {
      res.courseId = c.id;
      text = text.replace(legacy[0], ' ');
    }
  }
  if (!res.courseId && courses.length) {
    const entries = courses.flatMap((c) => courseAliases(c).map((alias) => ({ c, alias })));
    entries.sort((a, b) => b.alias.length - a.alias.length);
    // "for linear algebra", "in chem 210 class": the phrase is removed from the title.
    for (const { c, alias } of entries) {
      const re = new RegExp(`[\\s,]*\\b(?:for|in)\\s+(?:my\\s+|the\\s+)?${aliasPattern(alias)}(?:\\s+class)?\\b`, 'i');
      if (take(re, () => {
        res.courseId = c.id;
      }))
        break;
    }
    // A class mentioned as part of the title ("math homework") is detected but left in place.
    if (!res.courseId) {
      for (const { c, alias } of entries) {
        if (new RegExp(`\\b${aliasPattern(alias)}\\b`, 'i').test(text)) {
          res.courseId = c.id;
          break;
        }
      }
    }
    // Abbreviations: "chem" → Organic Chemistry, "psych" → Intro to Psychology.
    if (!res.courseId) {
      const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
      outer: for (const w of words) {
        if (STOPWORDS.has(w)) continue;
        for (const c of courses) {
          const nameWords = (c.name.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((nw) => !GENERIC_NAME_WORDS.has(nw));
          if (nameWords.some((nw) => nw.startsWith(w))) {
            res.courseId = c.id;
            break outer;
          }
        }
      }
    }
  }
  if (res.courseId) {
    const c = courses.find((x) => x.id === res.courseId)!;
    res.matched.course = c.code || c.name;
  }

  // ── Title: whatever is left, minus connector words at the edges ──
  const EDGE = /^(?:[\s,;:.\-–—]|\b(?:due|is|it'?s|its|by|on|at|before|until|for|and|with|to)\b)+|(?:[\s,;:.\-–—]|\b(?:due|is|it'?s|its|by|on|at|before|until|for|and|with|to)\b)+$/gi;
  let title = quoted ?? text.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1');
  let prev = '';
  while (prev !== title) {
    prev = title;
    title = title.replace(EDGE, '').trim();
  }
  title = title.replace(/\s+\bdue\b\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
  if (title && title[0] === title[0].toLowerCase()) title = title[0].toUpperCase() + title.slice(1);
  res.title = title;

  for (const [re, type] of TYPE_KEYWORDS) {
    if (re.test(res.title)) {
      res.type = type;
      break;
    }
  }
  return res;
}
