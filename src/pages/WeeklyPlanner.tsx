import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Eye, EyeOff, Flame, Plus } from 'lucide-react';
import type { Assignment, Course } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useAssignmentActions, useNow } from '../lib/hooks';
import { addDays, formatLongDate, formatMinutes, formatRange, formatTime, fromKey, isValidKey, startOfWeek, toKey, weekDays, weekdayShort } from '../lib/date';
import { compareByDue, isDone, isOverdue, sumMinutes } from '../lib/planning';
import { NO_CLASS_COLOR } from '../lib/constants';
import type { Route } from '../lib/router';
import { Checkbox } from '../components/Checkbox';
import { AssignmentRow } from '../components/AssignmentRow';
import { QuickAdd } from '../components/QuickAdd';
import { EmptyState, PageHeader, PriorityFlag } from '../components/ui';

export function WeeklyPlanner({ route }: { route: Route }) {
  const { data, actions } = useStore();
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const { reschedule } = useAssignmentActions();
  const now = useNow();
  const today = toKey(now);
  const showCompleted = data.settings.plannerShowCompleted;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const [selected, setSelected] = useState<string | null>(today);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    const day = route.query.get('day');
    if (day && isValidKey(day)) {
      setWeekStart(startOfWeek(fromKey(day)));
      setSelected(day);
    }
  }, [route.query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    return weekDays(weekStart).map((d) => {
      const key = toKey(d);
      const all = data.assignments.filter((a) => a.dueDate === key).sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareByDue(a, b));
      const open = all.filter((a) => !isDone(a));
      return { key, d, all, open, visible: showCompleted ? all : open, minutes: sumMinutes(open) };
    });
  }, [data.assignments, weekStart, showCompleted]);

  const weekTotals = useMemo(() => {
    const all = days.flatMap((d) => d.all);
    const done = all.filter(isDone).length;
    return { total: all.length, done, minutes: days.reduce((t, d) => t + d.minutes, 0) };
  }, [days]);

  const maxMinutes = Math.max(120, ...days.map((d) => d.minutes));
  const busiest = days.reduce((b, d) => (d.minutes > b.minutes ? d : b), days[0]);
  const isThisWeek = toKey(weekStart) === toKey(startOfWeek(now));
  const selectedDay = days.find((d) => d.key === selected);

  const shiftWeek = (n: number) => {
    const next = addDays(weekStart, n * 7);
    setWeekStart(next);
    setSelected(n === 0 ? today : null);
  };

  const onDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/x-assignment');
    if (id) reschedule(id, key);
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title="Weekly Planner"
        subtitle={formatRange(weekStart, addDays(weekStart, 6))}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => actions.updateSettings({ plannerShowCompleted: !showCompleted })}
              title={showCompleted ? 'Hide completed' : 'Show completed'}
            >
              {showCompleted ? <EyeOff size={15} /> : <Eye size={15} />}
              <span className="hide-mobile">{showCompleted ? 'Hide completed' : 'Show completed'}</span>
            </button>
            <div className="nav-group">
              <button type="button" className="icon-btn" onClick={() => shiftWeek(-1)} aria-label="Previous week">
                <ChevronLeft size={17} />
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setWeekStart(startOfWeek(now)); setSelected(today); }} disabled={isThisWeek && selected === today}>
                This week
              </button>
              <button type="button" className="icon-btn" onClick={() => shiftWeek(1)} aria-label="Next week">
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        }
      />

      <section className="card workload">
        <div className="workload-summary">
          <div>
            <div className="workload-num">{weekTotals.total}</div>
            <div className="muted small">assignments</div>
          </div>
          <div>
            <div className="workload-num">{formatMinutes(weekTotals.minutes) === '—' ? '0h' : formatMinutes(weekTotals.minutes)}</div>
            <div className="muted small">work remaining</div>
          </div>
          <div>
            <div className="workload-num">
              {weekTotals.done}
              <span className="muted">/{weekTotals.total}</span>
            </div>
            <div className="muted small">completed</div>
          </div>
        </div>
        <div className="workload-bars" aria-label="Estimated work per day">
          {days.map((d) => {
            const level = d.minutes >= 300 ? 'heavy' : d.minutes >= 150 ? 'medium' : 'light';
            return (
              <button
                type="button"
                key={d.key}
                className={`workload-day${d.key === selected ? ' selected' : ''}${d.key === today ? ' today' : ''}`}
                onClick={() => setSelected(d.key)}
                title={`${d.open.length} open · ${formatMinutes(d.minutes)} estimated`}
              >
                <span className="workload-val">{d.minutes ? formatMinutes(d.minutes) : ''}</span>
                <span className="workload-track">
                  <span className={`workload-fill ${level}`} style={{ height: `${(d.minutes / maxMinutes) * 100}%` }} />
                </span>
                <span className="workload-label">
                  {weekdayShort(d.d)}
                  {d === busiest && d.minutes > 0 && <Flame size={11} className="busiest-icon" aria-label="Busiest day" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="board" role="list">
        {days.map((d) => {
          const isToday = d.key === today;
          const past = d.key < today;
          return (
            <section
              key={d.key}
              role="listitem"
              className={`col${isToday ? ' col-today' : ''}${past ? ' col-past' : ''}${selected === d.key ? ' col-selected' : ''}${dragOver === d.key ? ' col-drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== d.key) setDragOver(d.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
              }}
              onDrop={(e) => onDrop(e, d.key)}
            >
              <button type="button" className="col-head" onClick={() => setSelected(selected === d.key ? null : d.key)} aria-pressed={selected === d.key}>
                <span className="col-weekday">{weekdayShort(d.d)}</span>
                <span className="col-date">{d.d.getDate()}</span>
                <span className="col-meta">
                  {d.open.length > 0 ? (
                    <span className={`count-badge${d.open.length >= 3 ? ' busy' : ''}`}>{d.open.length}</span>
                  ) : d.all.length > 0 ? (
                    <span className="count-badge done">✓</span>
                  ) : null}
                </span>
              </button>
              <div className="col-body">
                {d.visible.map((a) => (
                  <PlannerCard key={a.id} a={a} course={getCourse(a.courseId)} now={now} />
                ))}
                {d.visible.length === 0 && <div className="col-empty">{d.all.length ? 'All done' : 'Free'}</div>}
              </div>
              <button type="button" className="col-add" onClick={() => openEditor({ defaults: { dueDate: d.key } })}>
                <Plus size={14} /> Add
              </button>
            </section>
          );
        })}
      </div>
      <p className="muted small board-hint hide-mobile">Tip: drag a card to another day to reschedule it.</p>

      {selectedDay && (
        <section className="card day-detail">
          <div className="card-header">
            <h2 className="card-title">
              {formatLongDate(selectedDay.d)}
              {selectedDay.key === today && <span className="pill pill-accent">Today</span>}
            </h2>
            <span className="muted small">
              {selectedDay.open.length} open · {formatMinutes(selectedDay.minutes) === '—' ? 'no estimate' : `${formatMinutes(selectedDay.minutes)} of work`}
            </span>
          </div>
          <div className="day-detail-add">
            <QuickAdd defaultDate={selectedDay.key} placeholder={`Add to ${weekdayShort(selectedDay.d)} — e.g. “Chapter 5 notes #psyc ~45m”`} />
          </div>
          {selectedDay.all.length === 0 ? (
            <EmptyState compact title="Nothing due this day" description="Use the field above to add something." />
          ) : (
            <div>
              {selectedDay.all.map((a) => (
                <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} showDate={false} timeOnly />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PlannerCard({ a, course, now }: { a: Assignment; course: Course | null; now: Date }) {
  const { openEditor } = useUI();
  const { toggleComplete } = useAssignmentActions();
  const [dragging, setDragging] = useState(false);
  const done = isDone(a);
  const overdue = isOverdue(a, now);
  return (
    <article
      className={`pcard${done ? ' pcard-done' : ''}${overdue ? ' pcard-overdue' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--c': course?.color ?? NO_CLASS_COLOR } as React.CSSProperties}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-assignment', a.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => openEditor({ assignment: a })}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openEditor({ assignment: a })}
      aria-label={`${a.title}${course ? `, ${course.name}` : ''}`}
    >
      <div className="pcard-top">
        <Checkbox size="sm" checked={done} onChange={() => toggleComplete(a.id)} priority={a.priority} label={`Mark “${a.title}” complete`} />
        <span className="pcard-title">{a.title}</span>
      </div>
      <div className="pcard-meta">
        <span className="pcard-class">{course ? course.code || course.name : 'No class'}</span>
        {a.dueTime && (
          <span className="pcard-time">
            <Clock size={11} /> {formatTime(a.dueTime)}
          </span>
        )}
        {a.priority !== 'medium' && <PriorityFlag priority={a.priority} />}
      </div>
    </article>
  );
}
