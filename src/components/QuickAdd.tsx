import { useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Plus, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { parseQuickAdd } from '../lib/quickAdd';
import { formatDue, formatMinutes } from '../lib/date';
import { TYPE_LABEL } from '../lib/constants';
import type { AssignmentType, Priority } from '../types';

interface Props {
  /** Override the default date (e.g. when adding from a specific day). */
  defaultDate?: string;
  defaultCourseId?: string;
  /** Used when the text doesn't name a type (e.g. the Tests page defaults to "test"). */
  defaultType?: AssignmentType;
  defaultPriority?: Priority;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * One-line assignment entry. Understands `#class`, `!high`, `~90m`, and dates
 * like `tomorrow`, `fri`, `next mon`, `11/24`, plus times like `5pm`.
 */
export function QuickAdd({ defaultDate, defaultCourseId, defaultType, defaultPriority, placeholder, autoFocus }: Props) {
  const { data, actions } = useStore();
  const { toast, openEditor } = useUI();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const p = parseQuickAdd(value, data.courses);
    if (!p.matched.date && defaultDate) p.dueDate = defaultDate;
    if (!p.courseId && defaultCourseId) p.courseId = defaultCourseId;
    if (!p.type && defaultType) p.type = defaultType;
    if (!p.priority && defaultPriority) p.priority = defaultPriority;
    return p;
  }, [value, data.courses, defaultDate, defaultCourseId, defaultType, defaultPriority]);

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
    const when = formatDue(parsed.dueDate, parsed.dueTime).toLowerCase();
    toast(`Added “${parsed.title}” · ${parsed.type === 'test' || parsed.type === 'quiz' ? when : `due ${when}`}`, { tone: 'success' });
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
          placeholder={placeholder ?? 'Add something — e.g. “Essay draft due Friday at 5pm, high priority”'}
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
          <span className="qa-title">{parsed.title || <em>Type a name…</em>}</span>
          <span className="qa-details">
            {[
              course ? course.code || course.name : null,
              formatDue(parsed.dueDate, parsed.dueTime),
              parsed.priority === 'high' ? 'High priority' : parsed.priority === 'low' ? 'Low priority' : null,
              parsed.type === 'test' || parsed.type === 'quiz' ? TYPE_LABEL[parsed.type] : null,
              parsed.estimatedMinutes ? `~${formatMinutes(parsed.estimatedMinutes)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="qa-hint">
            <CornerDownLeft size={12} /> Enter to add
          </span>
        </div>
      )}
    </div>
  );
}
