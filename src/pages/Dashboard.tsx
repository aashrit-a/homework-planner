import { useMemo } from 'react';
import type { Assignment } from '../types';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, Coffee, Plus, Sun } from 'lucide-react';
import { useStore, useCourses } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useNow } from '../lib/hooks';
import { addDays, diffDays, formatLongDate, formatMinutes, fromKey, greeting, relativeDay, startOfWeek, toKey, weekDays, weekdayShort } from '../lib/date';
import { compareByDue, isDone, isOverdue, sumMinutes, weekRangeKeys } from '../lib/planning';
import { href, navigate } from '../lib/router';
import { AssignmentRow } from '../components/AssignmentRow';
import { QuickAdd } from '../components/QuickAdd';
import { Card, EmptyState, ProgressRing } from '../components/ui';

const UPCOMING_LIMIT = 8;

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function Dashboard() {
  const { data } = useStore();
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const now = useNow();
  const today = toKey(now);

  const view = useMemo(() => {
    const all = data.assignments;
    const active = all.filter((a) => !isDone(a));
    const [weekStart, weekEnd] = weekRangeKeys(now);
    const overdue = active.filter((a) => isOverdue(a, now)).sort(compareByDue);
    const dueToday = all.filter((a) => a.dueDate === today).sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareByDue(a, b));
    const dueTodayOpen = dueToday.filter((a) => !isDone(a) && !isOverdue(a, now));
    const weekAll = all.filter((a) => a.dueDate >= weekStart && a.dueDate <= weekEnd);
    const weekOpen = weekAll.filter((a) => !isDone(a));
    const weekDone = weekAll.filter(isDone);
    const upcomingEnd = toKey(addDays(now, 7));
    const upcoming = active.filter((a) => a.dueDate > today && a.dueDate <= upcomingEnd).sort(compareByDue);
    const completedTotal = all.filter(isDone).length;
    const days = weekDays(startOfWeek(now)).map((d) => {
      const key = toKey(d);
      const list = all.filter((a) => a.dueDate === key);
      return { key, d, total: list.length, done: list.filter(isDone).length, minutes: sumMinutes(list.filter((a) => !isDone(a))) };
    });
    return { overdue, dueToday, dueTodayOpen, weekAll, weekOpen, weekDone, upcoming, completedTotal, days };
  }, [data.assignments, now, today]);

  const name = data.settings.userName.trim();
  const weekPct = view.weekAll.length ? view.weekDone.length / view.weekAll.length : 0;
  const todayMinutes = sumMinutes(view.dueTodayOpen);

  const summary = (() => {
    const parts: string[] = [];
    if (view.dueTodayOpen.length) parts.push(`${plural(view.dueTodayOpen.length, 'assignment')} due today${todayMinutes ? ` (about ${formatMinutes(todayMinutes)} of work)` : ''}`);
    else parts.push('nothing left due today');
    const restOfWeek = view.weekOpen.filter((a) => a.dueDate > today).length;
    if (restOfWeek) parts.push(`${restOfWeek} more later this week`);
    let s = `You have ${parts.join(' and ')}.`;
    if (view.overdue.length) s += ` ${plural(view.overdue.length, 'item')} ${view.overdue.length === 1 ? 'is' : 'are'} overdue.`;
    return s;
  })();

  const maxMinutes = Math.max(60, ...view.days.map((d) => d.minutes));
  const busiest = view.days.reduce((b, d) => (d.minutes > b.minutes ? d : b), view.days[0]);

  return (
    <div className="page page-dashboard">
      <header className="welcome">
        <div>
          <p className="welcome-date">{formatLongDate(now)}</p>
          <h1 className="welcome-title">
            {greeting(now)}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="welcome-summary">{summary}</p>
        </div>
        <button type="button" className="btn btn-primary hide-mobile" onClick={() => openEditor()}>
          <Plus size={16} /> Add assignment
        </button>
      </header>

      <QuickAdd />

      <div className="stats">
        <StatCard label="Due today" value={view.dueTodayOpen.length} hint={todayMinutes ? `~${formatMinutes(todayMinutes)} of work` : 'All clear'} icon={<Sun size={16} />} onClick={() => navigate('/assignments?view=today')} />
        <StatCard label="Due this week" value={view.weekOpen.length} hint={`${view.weekAll.length} total this week`} icon={<CalendarClock size={16} />} onClick={() => navigate('/planner')} />
        <StatCard label="Completed" value={view.completedTotal} hint={`${view.weekDone.length} this week`} icon={<CheckCircle2 size={16} />} tone="success" onClick={() => navigate('/assignments?view=completed')} />
        <StatCard label="Overdue" value={view.overdue.length} hint={view.overdue.length ? 'Needs attention' : 'You’re caught up'} icon={<AlertTriangle size={16} />} tone={view.overdue.length ? 'danger' : undefined} onClick={() => navigate('/assignments?view=overdue')} />
      </div>

      <div className="dash-grid">
        <div className="dash-main">
          <Card
            title={
              <>
                Today <span className="card-count">{view.dueToday.length + view.overdue.length}</span>
              </>
            }
            action={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEditor({ defaults: { dueDate: today } })}>
                <Plus size={14} /> Add for today
              </button>
            }
            padded={false}
          >
            {view.overdue.length > 0 && (
              <div className="group">
                <div className="group-label group-label-danger">
                  <AlertTriangle size={13} /> Overdue
                </div>
                {view.overdue.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />
                ))}
              </div>
            )}
            {view.dueToday.filter((a) => !view.overdue.includes(a)).length > 0 ? (
              <div className="group">
                {view.overdue.length > 0 && <div className="group-label">Due today</div>}
                {view.dueToday
                  .filter((a) => !view.overdue.includes(a))
                  .map((a) => (
                    <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} showDate={false} timeOnly />
                  ))}
              </div>
            ) : (
              view.overdue.length === 0 && (
                <EmptyState
                  compact
                  icon={<Coffee size={20} />}
                  title="Nothing due today"
                  description={view.upcoming[0] ? `Next up: “${view.upcoming[0].title}” ${relativeDay(view.upcoming[0].dueDate, today).toLowerCase()}.` : 'Enjoy the breathing room.'}
                />
              )
            )}
          </Card>

          <Card
            title="Upcoming deadlines"
            action={
              <a className="link-btn" href={href('/assignments')}>
                View all <ChevronRight size={14} />
              </a>
            }
            padded={false}
          >
            {view.upcoming.length === 0 ? (
              <EmptyState compact title="No deadlines in the next 7 days" description="Add assignments as they’re announced to keep this list useful." />
            ) : (
              <>
                <UpcomingList list={view.upcoming.slice(0, UPCOMING_LIMIT)} today={today} now={now} getCourse={getCourse} />
                {view.upcoming.length > UPCOMING_LIMIT && (
                  <div className="show-more">
                    <a className="link-btn" href={href('/planner')}>
                      {view.upcoming.length - UPCOMING_LIMIT} more this week in the planner <ChevronRight size={14} />
                    </a>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <aside className="dash-side">
          <Card title="This week">
            <div className="progress-head">
              <ProgressRing value={weekPct} size={76} stroke={7}>
                <span className="ring-pct">{Math.round(weekPct * 100)}%</span>
              </ProgressRing>
              <div>
                <div className="progress-big">
                  {view.weekDone.length}
                  <span className="progress-of"> / {view.weekAll.length}</span>
                </div>
                <div className="muted small">assignments completed</div>
                <div className="progress-msg">{progressMessage(view.weekDone.length, view.weekAll.length)}</div>
              </div>
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${weekPct * 100}%` }} />
            </div>
            <div className="week-mini" role="list" aria-label="Workload by day">
              {view.days.map((d) => (
                <a
                  key={d.key}
                  href={href(`/planner?day=${d.key}`)}
                  role="listitem"
                  className={`week-mini-day${d.key === today ? ' today' : ''}`}
                  title={`${weekdayShort(d.d)}: ${d.total} due, ${formatMinutes(d.minutes)} remaining`}
                >
                  <div className="week-mini-bar">
                    <div
                      className={`week-mini-fill${d === busiest && d.minutes > 0 ? ' busiest' : ''}`}
                      style={{ height: `${Math.max(d.total ? 8 : 0, (d.minutes / maxMinutes) * 100)}%` }}
                    />
                  </div>
                  <span className="week-mini-label">{weekdayShort(d.d).slice(0, 1)}</span>
                  <span className="week-mini-count">{d.total || ''}</span>
                </a>
              ))}
            </div>
            {busiest && busiest.minutes > 0 && (
              <p className="muted small week-mini-note">
                Busiest day: <strong>{diffDays(today, busiest.key) === 0 ? 'today' : relativeDay(busiest.key, today)}</strong> · {formatMinutes(busiest.minutes)} remaining
              </p>
            )}
          </Card>

          <ClassesSnapshot />
        </aside>
      </div>
    </div>
  );
}

function progressMessage(done: number, total: number): string {
  if (total === 0) return 'A quiet week so far.';
  const pct = done / total;
  if (pct === 1) return 'Week complete. Nicely done.';
  if (pct >= 0.75) return 'Almost there.';
  if (pct >= 0.5) return 'Over halfway.';
  if (pct > 0) return 'Good start — keep it steady.';
  return 'One assignment at a time.';
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: 'danger' | 'success';
  onClick: () => void;
}) {
  return (
    <button type="button" className={`stat${tone ? ` stat-${tone}` : ''}`} onClick={onClick}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </button>
  );
}

function UpcomingList({
  list,
  today,
  now,
  getCourse,
}: {
  list: Assignment[];
  today: string;
  now: Date;
  getCourse: ReturnType<typeof useCourses>['getCourse'];
}) {
  const groups = new Map<string, Assignment[]>();
  for (const a of list) groups.set(a.dueDate, [...(groups.get(a.dueDate) ?? []), a]);
  return (
    <>
      {[...groups.entries()].map(([day, items]) => {
        const days = diffDays(today, day);
        return (
          <div className="group" key={day}>
            <div className={`group-label${days <= 2 ? ' group-label-warn' : ''}`}>
              {relativeDay(day, today)}
              <span className="group-sub">
                {fromKey(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {days <= 2 ? ' · soon' : ''}
              </span>
            </div>
            {items.map((a) => (
              <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} showDate={false} timeOnly />
            ))}
          </div>
        );
      })}
    </>
  );
}

function ClassesSnapshot() {
  const { data } = useStore();
  const stats = useMemo(
    () =>
      data.courses.map((c) => {
        const list = data.assignments.filter((a) => a.courseId === c.id);
        const open = list.filter((a) => !isDone(a));
        return { c, open: open.length, total: list.length, done: list.length - open.length };
      }),
    [data.courses, data.assignments],
  );
  if (!stats.length) {
    return (
      <Card title="Classes">
        <EmptyState compact title="No classes yet" action={<a className="btn btn-secondary btn-sm" href={href('/classes')}>Add a class</a>} />
      </Card>
    );
  }
  return (
    <Card
      title="Classes"
      action={
        <a className="link-btn" href={href('/classes')}>
          Manage <ChevronRight size={14} />
        </a>
      }
    >
      <ul className="class-snapshot">
        {stats.map(({ c, open, total, done }) => (
          <li key={c.id}>
            <a href={href(`/classes/${c.id}`)} className="class-snapshot-row">
              <span className="class-dot" style={{ '--c': c.color } as React.CSSProperties} />
              <span className="truncate">{c.code || c.name}</span>
              <span className="class-snapshot-bar">
                <span style={{ width: `${total ? (done / total) * 100 : 0}%`, background: c.color }} />
              </span>
              <span className="muted small tabular">{open} open</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
