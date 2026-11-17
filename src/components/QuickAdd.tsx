import { useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Plus, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { parseQuickAdd } from '../lib/quickAdd';
import { formatDue, formatMinutes } from '../lib/date';
import { ClassTag, PriorityFlag } from './ui';
import { TYPE_LABEL } from '../lib/constants';

interface Props {
  /** Override the default date (e.g. when adding from a specific day). */
  defaultDate?: string;
  defaultCourseId?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * One-line assignment entry. Understands `#class`, `!high`, `~90m`, and dates
 * like `tomorrow`, `fri`, `next mon`, `11/24`, plus times like `5pm`.
 */
export function QuickAdd({ defaultDate, defaultCourseId, placeholder, autoFocus }: Props) {
  const { data, actions } = useStore();
  const { toast, openEditor } = useUI();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const p = parseQuickAdd(value, data.courses);
    if (!p.matched.date && defaultDate) p.dueDate = defaultDate;
    if (!p.courseId && defaultCourseId) p.courseId = defaultCourseId;
    return p;
  }, [value, data.courses, defaultDate, defaultCourseId]);

  const course = parsed.courseId ? data.courses.find((c) => c.id === parsed.courseId) ?? null : null;

  const submit = () => {
    if (!parsed.title) return;
    actions.addAssignment({
      title: parsed.title,
      courseId: parsed.courseId,
      notes: '',
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      estimatedMinutes: parsed.estimatedMinutes,
      priority: parsed.priority ?? 'medium',
      type: parsed.type ?? 'homework',
      status: 'not_started',
    });
    toast(`Added “${parsed.title}” · due ${formatDue(parsed.dueDate, parsed.dueTime).toLowerCase()}`, { tone: 'success' });
    setValue('');
  };

  const openFull = () => {
    openEditor({
      defaults: {
        title: parsed.title,
        courseId: parsed.courseId,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        estimatedMinutes: parsed.estimatedMinutes,
        priority: parsed.priority ?? 'medium',
        type: parsed.type ?? 'homework',
      },
    });
    setValue('');
  };

  const showPreview = focused && value.trim().length > 0;

  return (
    <div className={`quickadd${focused ? ' focused' : ''}`}>
      <div className="quickadd-bar">
        <Plus size={16} className="quickadd-icon" />
        <input
          ref={inputRef}
          className="quickadd-input"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.metaKey || e.ctrlKey) openFull();
              else submit();
            }
            if (e.key === 'Escape') {
              setValue('');
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder ?? 'Quick add — try “Lab report #psyc fri 5pm !high ~2h”'}
          aria-label="Quick add assignment"
        />
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          title="Open full form"
          aria-label="Open full form"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openFull}
        >
          <SlidersHorizontal size={15} />
        </button>
      </div>
      {showPreview && (
        <div className="quickadd-preview" aria-live="polite">
          <span className="qa-title">{parsed.title || <em>Add a title…</em>}</span>
          <ClassTag course={course} size="sm" />
          <span className="qa-chip">{formatDue(parsed.dueDate, parsed.dueTime)}</span>
          {parsed.priority && (
            <span className="qa-chip">
              <PriorityFlag priority={parsed.priority} withLabel />
            </span>
          )}
          {parsed.type && <span className="qa-chip">{TYPE_LABEL[parsed.type]}</span>}
          {parsed.estimatedMinutes && <span className="qa-chip">~{formatMinutes(parsed.estimatedMinutes)}</span>}
          <span className="qa-hint">
            <CornerDownLeft size={12} /> to add
          </span>
        </div>
      )}
    </div>
  );
}
