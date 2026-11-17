import { memo, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleDashed, Circle, Clock, MoreHorizontal, Pencil, StickyNote, Trash2, CalendarPlus, CalendarDays } from 'lucide-react';
import type { Assignment, Course } from '../types';
import { Checkbox } from './Checkbox';
import { ClassTag, PriorityFlag } from './ui';
import { Menu } from './Menu';
import { useUI } from '../store/UIContext';
import { useAssignmentActions } from '../lib/hooks';
import { formatDue, formatMinutes, formatTime, addDaysKey, todayKey } from '../lib/date';
import { isOverdue, isUrgent } from '../lib/planning';
import { PRIORITIES, TYPE_LABEL } from '../lib/constants';

interface Props {
  assignment: Assignment;
  course: Course | null;
  now: Date;
  showDate?: boolean;
  showClass?: boolean;
  /** Show only time instead of full due date (e.g. inside a "Today" group). */
  timeOnly?: boolean;
  extra?: React.ReactNode;
}

function AssignmentRowImpl({ assignment: a, course, now, showDate = true, showClass = true, timeOnly, extra }: Props) {
  const { openEditor } = useUI();
  const { toggleComplete, remove, setPriority, setStatus, reschedule } = useAssignmentActions();
  const [completing, setCompleting] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const done = a.status === 'completed';
  const overdue = isOverdue(a, now);
  const urgent = !overdue && isUrgent(a, now);

  const onToggle = () => {
    if (done) {
      toggleComplete(a.id);
      return;
    }
    // Let the check animation play before the row moves or disappears.
    setCompleting(true);
    timer.current = window.setTimeout(() => {
      setCompleting(false);
      toggleComplete(a.id);
    }, 420);
  };

  const dueLabel = timeOnly ? (a.dueTime ? formatTime(a.dueTime) : 'Any time') : formatDue(a.dueDate, a.dueTime);

  return (
    <div
      className={`row${done ? ' row-done' : ''}${completing ? ' row-completing' : ''}${overdue ? ' row-overdue' : ''}`}
      onClick={() => openEditor({ assignment: a })}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') openEditor({ assignment: a });
        if (e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <Checkbox checked={done || completing} onChange={onToggle} priority={a.priority} label={`Mark “${a.title}” complete`} />
      <div className="row-main">
        <div className="row-title">
          <span className="row-title-text">{a.title}</span>
          {a.status === 'in_progress' && <span className="pill pill-progress">In progress</span>}
        </div>
        <div className="row-meta">
          {showClass && <ClassTag course={course} size="sm" />}
          <span className="row-meta-item">{TYPE_LABEL[a.type]}</span>
          {a.estimatedMinutes ? (
            <span className="row-meta-item">
              <Clock size={12} /> {formatMinutes(a.estimatedMinutes)}
            </span>
          ) : null}
          {a.notes && (
            <span className="row-meta-item" title={a.notes}>
              <StickyNote size={12} />
            </span>
          )}
          {extra}
        </div>
      </div>
      <div className="row-side">
        {showDate || timeOnly ? (
          <span className={`due${overdue ? ' due-overdue' : urgent ? ' due-urgent' : ''}${done ? ' due-done' : ''}`}>
            {overdue && !timeOnly ? <span className="due-prefix">Overdue · </span> : ''}
            {dueLabel}
          </span>
        ) : null}
        <Menu
          label="Priority"
          items={PRIORITIES.map((p) => ({
            label: `${p.label} priority`,
            icon: <PriorityFlag priority={p.value} />,
            checked: a.priority === p.value,
            onSelect: () => setPriority(a.id, p.value),
          }))}
          trigger={(t) => (
            <button type="button" className="icon-btn icon-btn-sm" aria-label={`Priority: ${a.priority}`} {...t}>
              <PriorityFlag priority={a.priority} />
            </button>
          )}
        />
        <Menu
          label="Assignment actions"
          items={[
            { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => openEditor({ assignment: a }) },
            { label: '', divider: true, onSelect: () => {} },
            { label: 'Not started', icon: <Circle size={14} />, checked: a.status === 'not_started', onSelect: () => setStatus(a.id, 'not_started') },
            { label: 'In progress', icon: <CircleDashed size={14} />, checked: a.status === 'in_progress', onSelect: () => setStatus(a.id, 'in_progress') },
            { label: 'Completed', icon: <CircleCheck size={14} />, checked: a.status === 'completed', onSelect: () => setStatus(a.id, 'completed') },
            { label: '', divider: true, onSelect: () => {} },
            { label: 'Move to today', icon: <CalendarDays size={14} />, onSelect: () => reschedule(a.id, todayKey()) },
            { label: 'Push back a day', icon: <CalendarPlus size={14} />, onSelect: () => reschedule(a.id, addDaysKey(a.dueDate, 1)) },
            { label: '', divider: true, onSelect: () => {} },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => remove(a.id) },
          ]}
          trigger={(t) => (
            <button type="button" className="icon-btn icon-btn-sm row-more" aria-label="More actions" {...t}>
              <MoreHorizontal size={16} />
            </button>
          )}
        />
      </div>
    </div>
  );
}

export const AssignmentRow = memo(AssignmentRowImpl);
