import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, X } from 'lucide-react';
import type { Assignment, Course } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useAssignmentActions, useNow } from '../lib/hooks';
import { addDays, formatLongDate, formatRange, formatTime, fromKey, isValidKey, startOfWeek, toKey, weekDays, weekdayShort } from '../lib/date';
import { compareByDue, isDone, isOverdue, sumMinutes } from '../lib/planning';
import { NO_CLASS_COLOR, TYPE_LABEL } from '../lib/constants';
import { isTest } from '../lib/tests';
import type { Route } from '../lib/router';
import { Checkbox } from '../components/Checkbox';
import { AssignmentRow } from '../components/AssignmentRow';
import { PageHeader } from '../components/ui';

export function WeeklyPlanner({ route }: { route: Route }) {
  const { data, actions } = useStore();
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const { reschedule } = useAssignmentActions();
  const now = useNow();
  const today = toKey(now);
  const showCompleted = data.settings.plannerShowCompleted;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const [selected, setSelected] = useState<string | null>(null);
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

  const isThisWeek = toKey(weekStart) === toKey(startOfWeek(now));
  const selectedDay = days.find((d) => d.key === selected);

  const shiftWeek = (n: number) => {
    const next = addDays(weekStart, n * 7);
    setWeekStart(next);
    setSelected(null);
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
              aria-label={showCompleted ? 'Hide completed' : 'Show completed'}
            >
              {showCompleted ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <div className="nav-group">
              <button type="button" className="icon-btn" onClick={() => shiftWeek(-1)} aria-label="Previous week">
                <ChevronLeft size={17} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setWeekStart(startOfWeek(now)); setSelected(null); }} disabled={isThisWeek}>
                This week
              </button>
              <button type="button" className="icon-btn" onClick={() => shiftWeek(1)} aria-label="Next week">
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        }
      />

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
                {d.open.length > 0 && <span className="col-count">{d.open.length}</span>}
              </button>
              <div className="col-body">
                {d.visible.map((a) => (
                  <PlannerCard key={a.id} a={a} course={getCourse(a.courseId)} now={now} />
                ))}
              </div>
              <button type="button" className="col-add" onClick={() => openEditor({ defaults: { dueDate: d.key } })}>
                <Plus size={14} />
                <span className="sr-only">Add to {weekdayShort(d.d)}</span>
              </button>
            </section>
          );
        })}
      </div>

      {selectedDay && (
        <section className="card day-detail">
          <div className="card-header">
            <h2 className="card-title">{formatLongDate(selectedDay.d)}</h2>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => setSelected(null)} aria-label="Close day">
              <X size={15} />
            </button>
          </div>
          {selectedDay.all.length === 0 ? (
            <p className="section-empty day-detail-empty">Nothing due this day.</p>
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
        <Checkbox size="sm" checked={done} onChange={() => toggleComplete(a.id)} label={`Mark “${a.title}” complete`} />
        <span className="pcard-title">{a.title}</span>
      </div>
      <div className="pcard-meta">
        <span className="pcard-class">{course ? course.code || course.name : 'No class'}</span>
        {isTest(a) && <span>· {TYPE_LABEL[a.type]}</span>}
        {a.dueTime && <span>· {formatTime(a.dueTime)}</span>}
        {a.priority === 'high' && !done && <span className="pcard-high" aria-label="High priority" />}
      </div>
    </article>
  );
}
