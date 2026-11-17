import { memo, useEffect, useRef, useState } from 'react';
import { CalendarDays, CalendarPlus, Circle, CircleCheck, CircleDashed, Flag, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Assignment, Course } from '../types';
import { Checkbox } from './Checkbox';
import { Menu } from './Menu';
import { useUI } from '../store/UIContext';
import { useAssignmentActions } from '../lib/hooks';
import { addDaysKey, formatDue, formatTime, todayKey } from '../lib/date';
import { isOverdue } from '../lib/planning';
import { NO_CLASS_COLOR } from '../lib/constants';

interface Props {
  assignment: Assignment;
  course: Course | null;
  now: Date;
  showDate?: boolean;
  showClass?: boolean;
  /** Show only the time instead of the full due date (e.g. inside a "Today" list). */
  timeOnly?: boolean;
}

/**
 * One assignment: checkbox, title, class and due date. Priority is only
 * shown when high; everything else lives in the ⋯ menu or the editor.
 */
function AssignmentRowImpl({ assignment: a, course, now, showDate = true, showClass = true, timeOnly }: Props) {
  const { openEditor } = useUI();
  const { toggleComplete, remove, setPriority, setStatus, reschedule } = useAssignmentActions();
  const [completing, setCompleting] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const done = a.status === 'completed';
  const overdue = isOverdue(a, now);
  const isTestLike = a.type === 'test' || a.type === 'quiz';

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

  const dueLabel = timeOnly ? (a.dueTime ? formatTime(a.dueTime) : '') : formatDue(a.dueDate, a.dueTime);

  return (
    <div
      className={`row${done ? ' row-done' : ''}${completing ? ' row-completing' : ''}`}
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
      <Checkbox checked={done || completing} onChange={onToggle} label={`Mark “${a.title}” complete`} />
      <div className="row-main">
        <span className="row-title-text">{a.title}</span>
        {(showClass || isTestLike) && (
          <span className="row-meta">
            {showClass && (
              <span className="row-class">
                <span className="class-dot" style={{ '--c': course?.color ?? NO_CLASS_COLOR } as React.CSSProperties} />
                {course ? course.code || course.name : 'No class'}
              </span>
            )}
            {isTestLike && <span className="row-kind">{a.type === 'quiz' ? 'Quiz' : 'Test'}</span>}
          </span>
        )}
      </div>
      <div className="row-side">
        {a.priority === 'high' && !done && <Flag size={13} className="row-flag" fill="currentColor" aria-label="High priority" />}
        {(showDate || timeOnly) && dueLabel && (
          <span className={`due${overdue ? ' due-overdue' : ''}`}>
            {overdue && !timeOnly ? (
              <>
                Overdue<span className="due-when"> · {dueLabel}</span>
              </>
            ) : (
              dueLabel
            )}
          </span>
        )}
        <Menu
          label="Assignment actions"
          items={[
            { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => openEditor({ assignment: a }) },
            { label: '', divider: true, onSelect: () => {} },
            { label: 'High priority', icon: <Flag size={14} />, checked: a.priority === 'high', onSelect: () => setPriority(a.id, 'high') },
            { label: 'Medium priority', icon: <Flag size={14} />, checked: a.priority === 'medium', onSelect: () => setPriority(a.id, 'medium') },
            { label: 'Low priority', icon: <Flag size={14} />, checked: a.priority === 'low', onSelect: () => setPriority(a.id, 'low') },
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
