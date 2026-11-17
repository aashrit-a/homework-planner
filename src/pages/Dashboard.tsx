import { useMemo } from 'react';
import { BookOpen, Check, GraduationCap, ListTodo, UserRound } from 'lucide-react';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useNow } from '../lib/hooks';
import { addDays, formatLongDate, greeting, toKey } from '../lib/date';
import { compareByDue, isDone, isOverdue, weekRangeKeys } from '../lib/planning';
import { countdown, isTest, upcomingTests } from '../lib/tests';
import { href, navigate } from '../lib/router';
import { NO_CLASS_COLOR } from '../lib/constants';
import { AssignmentRow } from '../components/AssignmentRow';
import { QuickAdd } from '../components/QuickAdd';
import { Section } from '../components/ui';

const COMING_UP_LIMIT = 5;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function Dashboard() {
  const { data } = useStore();
  const { getCourse } = useCourses();
  const now = useNow();
  const today = toKey(now);

  const view = useMemo(() => {
    const open = data.assignments.filter((a) => !isDone(a));
    const overdue = open.filter((a) => isOverdue(a, now)).sort(compareByDue);
    const dueToday = data.assignments
      .filter((a) => a.dueDate === today && !overdue.includes(a))
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareByDue(a, b));
    const horizon = toKey(addDays(now, 7));
    const comingUp = open.filter((a) => a.dueDate > today && a.dueDate <= horizon && !isTest(a)).sort(compareByDue);
    const tests = upcomingTests(data.assignments, now).filter((a) => a.dueDate > today);
    const [ws, we] = weekRangeKeys(now);
    const week = data.assignments.filter((a) => a.dueDate >= ws && a.dueDate <= we);
    return { overdue, dueToday, comingUp, tests, weekTotal: week.length, weekDone: week.filter(isDone).length };
  }, [data.assignments, now, today]);

  const name = data.settings.userName.trim();
  const isEmpty = data.assignments.length === 0 && data.courses.length === 0;
  const showGettingStarted = data.courses.length === 0 || data.assignments.length === 0;

  const todayOpen = view.dueToday.filter((a) => !isDone(a)).length;
  const summary = isEmpty
    ? 'Your planner is empty. Add a few things below to get going.'
    : [
        todayOpen ? `${plural(todayOpen, 'thing')} due today` : 'Nothing left due today',
        view.overdue.length ? `${view.overdue.length} overdue` : '',
        view.tests[0] ? `next test ${countdown(view.tests[0], now).label.toLowerCase()}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <div className="page page-dashboard">
      <header className="welcome">
        <p className="welcome-date">{formatLongDate(now)}</p>
        <h1 className="welcome-title">
          {greeting(now)}
          {name ? `, ${name}` : ''}
        </h1>
        <p className="welcome-summary">{summary}</p>
        {view.weekTotal > 0 && (
          <div className="week-progress" title="Assignments due this week">
            <div className="week-progress-bar">
              <div style={{ width: `${(view.weekDone / view.weekTotal) * 100}%` }} />
            </div>
            <span>
              {view.weekDone} of {view.weekTotal} done this week
            </span>
          </div>
        )}
      </header>

      <QuickAdd />

      {showGettingStarted && <GettingStarted />}

      {!isEmpty && (
        <>
          <Section title="Today">
            {view.overdue.length + view.dueToday.length === 0 ? (
              <p className="section-empty">Nothing due today.</p>
            ) : (
              <div className="list">
                {view.overdue.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />
                ))}
                {view.dueToday.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} showDate={false} timeOnly />
                ))}
              </div>
            )}
          </Section>

          <Section title="Coming up" action={view.comingUp.length > COMING_UP_LIMIT ? <a href={href('/assignments')}>See all {view.comingUp.length}</a> : null}>
            {view.comingUp.length === 0 ? (
              <p className="section-empty">Nothing else due in the next 7 days.</p>
            ) : (
              <div className="list">
                {view.comingUp.slice(0, COMING_UP_LIMIT).map((a) => (
                  <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />
                ))}
              </div>
            )}
          </Section>

          {view.tests.length > 0 && (
            <Section title="Tests" action={<a href={href('/tests')}>All tests</a>}>
              <div className="list">
                {view.tests.slice(0, 3).map((a) => {
                  const c = getCourse(a.courseId);
                  const cd = countdown(a, now);
                  return (
                    <button key={a.id} type="button" className="test-line" onClick={() => navigate('/tests')}>
                      <span className="class-dot" style={{ '--c': c?.color ?? NO_CLASS_COLOR } as React.CSSProperties} />
                      <span className="test-line-title">{a.title}</span>
                      <span className="test-line-class">{c ? c.code || c.name : ''}</span>
                      <span className={`test-line-when${cd.tone === 'danger' ? ' soon' : ''}`}>{cd.label}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function GettingStarted() {
  const { data } = useStore();
  const { openEditor } = useUI();
  const steps = [
    { done: data.courses.length > 0, icon: <BookOpen size={15} />, title: 'Add your classes', action: () => navigate('/classes?new=1') },
    { done: data.assignments.some(isTest), icon: <GraduationCap size={15} />, title: 'Add an upcoming test', action: () => openEditor({ defaults: { type: 'test', priority: 'high' } }) },
    { done: data.assignments.some((a) => !isTest(a)), icon: <ListTodo size={15} />, title: 'Add an assignment', action: () => openEditor() },
    { done: data.settings.userName.trim().length > 0, icon: <UserRound size={15} />, title: 'Add your name', action: () => navigate('/settings') },
  ];
  return (
    <Section title="Get started">
      <div className="list">
        {steps.map((s) => (
          <button key={s.title} type="button" className={`gs-step${s.done ? ' done' : ''}`} onClick={s.action} disabled={s.done}>
            <span className="gs-icon">{s.done ? <Check size={15} strokeWidth={2.5} /> : s.icon}</span>
            <span className="gs-title">{s.title}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}
