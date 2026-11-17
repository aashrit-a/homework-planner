import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import type { AssignmentInput, AssignmentType, Priority, Status, StudyTopic } from '../types';
import { TopicChecklist } from './TopicChecklist';
import { isTestType } from '../lib/tests';
import { Modal } from './Modal';
import { PriorityFlag, Segmented } from './ui';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useAssignmentActions } from '../lib/hooks';
import { CLASS_COLORS, ESTIMATE_PRESETS, PRIORITIES, STATUSES, TYPES } from '../lib/constants';
import { addDays, formatMinutes, fromKey, monthShort, startOfWeek, toKey, todayKey, weekdayShort } from '../lib/date';

const NEW_CLASS = '__new__';

type FormState = {
  title: string;
  courseId: string;
  notes: string;
  dueDate: string;
  dueTime: string;
  estimate: string; // minutes as string, '' = none, 'custom'
  customEstimate: string;
  priority: Priority;
  type: AssignmentType;
  status: Status;
  location: string;
  topics: StudyTopic[];
};

function initialState(input: Partial<AssignmentInput> | undefined, lastCourseId: string): FormState {
  const est = input?.estimatedMinutes ?? null;
  const preset = est == null ? '' : ESTIMATE_PRESETS.includes(est) ? String(est) : 'custom';
  return {
    title: input?.title ?? '',
    courseId: input?.courseId ?? (input && 'courseId' in input ? '' : lastCourseId),
    notes: input?.notes ?? '',
    dueDate: input?.dueDate ?? todayKey(),
    dueTime: input?.dueTime ?? '',
    estimate: preset,
    customEstimate: preset === 'custom' && est ? String(est) : '',
    priority: input?.priority ?? 'medium',
    type: input?.type ?? 'homework',
    status: input?.status ?? 'not_started',
    location: input?.location ?? '',
    topics: input?.topics ?? [],
  };
}

export function AssignmentEditor() {
  const { editor, closeEditor, toast } = useUI();
  const { data, actions } = useStore();
  const { remove } = useAssignmentActions();
  const editing = editor?.assignment;
  const lastCourse = useRef('');
  const [form, setForm] = useState<FormState>(() => initialState(undefined, ''));
  const [newClassName, setNewClassName] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [error, setError] = useState('');
  const [showMore, setShowMore] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editor) return;
    setForm(initialState(editor.assignment ?? editor.defaults, lastCourse.current));
    setNewClassName('');
    setAddedCount(0);
    const a = editor.assignment;
    setShowMore(!!a && (!!a.notes || !!a.estimatedMinutes || a.status !== 'not_started'));
    setError('');
  }, [editor]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const today = todayKey();
  const quickDates = useMemo(() => {
    const t = new Date();
    const nextMon = addDays(startOfWeek(t), 7);
    const fri = addDays(startOfWeek(t), 4);
    const list = [
      { label: 'Today', key: toKey(t) },
      { label: 'Tomorrow', key: toKey(addDays(t, 1)) },
    ];
    if (toKey(fri) > toKey(addDays(t, 1))) list.push({ label: 'Friday', key: toKey(fri) });
    list.push({ label: 'Next Mon', key: toKey(nextMon) });
    return list;
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimateMinutes = (): number | null => {
    if (form.estimate === '') return null;
    if (form.estimate === 'custom') {
      const n = Math.round(Number(form.customEstimate));
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return Number(form.estimate);
  };

  const submit = (addAnother: boolean) => {
    const title = form.title.trim();
    if (!title) {
      setError('Give the assignment a title.');
      titleRef.current?.focus();
      return;
    }
    if (!form.dueDate) {
      setError('Pick a due date.');
      return;
    }
    let courseId: string | null = form.courseId || null;
    if (form.courseId === NEW_CLASS) {
      const name = newClassName.trim();
      if (!name) {
        setError('Name the new class, or pick an existing one.');
        return;
      }
      const used = new Set(data.courses.map((c) => c.color));
      const color = CLASS_COLORS.find((c) => !used.has(c)) ?? CLASS_COLORS[data.courses.length % CLASS_COLORS.length];
      courseId = actions.addCourse({ name, code: '', teacher: '', color }).id;
    }
    const input: AssignmentInput = {
      title,
      courseId,
      notes: form.notes.trim(),
      dueDate: form.dueDate,
      dueTime: form.dueTime || null,
      estimatedMinutes: estimateMinutes(),
      priority: form.priority,
      type: form.type,
      status: form.status,
      location: form.location.trim(),
      topics: form.topics,
    };
    lastCourse.current = courseId ?? '';

    if (editing) {
      actions.updateAssignment(editing.id, input);
      toast('Changes saved');
      closeEditor();
      return;
    }
    actions.addAssignment(input);
    if (addAnother) {
      setAddedCount((n) => n + 1);
      setForm((f) => ({ ...f, title: '', notes: '', courseId: courseId ?? '', status: 'not_started', location: '', topics: [] }));
      setNewClassName('');
      setError('');
      requestAnimationFrame(() => titleRef.current?.focus());
    } else {
      toast(addedCount ? `Added ${addedCount + 1} assignments` : `Added “${title}”`, { tone: 'success' });
      closeEditor();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(e.shiftKey && !editing);
    }
  };

  const close = () => {
    if (addedCount) toast(`Added ${addedCount} assignment${addedCount === 1 ? '' : 's'}`, { tone: 'success' });
    closeEditor();
  };

  const isTestForm = isTestType(form.type);
  const noun = form.type === 'quiz' ? 'quiz' : form.type === 'test' ? 'test' : 'assignment';
  const estOptions = ESTIMATE_PRESETS.map((m) => ({ value: String(m), label: formatMinutes(m) }));

  return (
    <Modal
      open={!!editor}
      onClose={close}
      title={editing ? `Edit ${noun}` : `New ${noun}`}
      size="lg"
      footer={
        <>
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => {
                remove(editing.id);
                closeEditor();
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span className="footer-hint">
              {addedCount > 0 && <span className="added-count">{addedCount} added</span>}
            </span>
          )}
          <div className="footer-actions">
            {!editing && (
              <button type="button" className="btn btn-secondary" onClick={() => submit(true)}>
                Save & add another
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => submit(false)}>
              {editing ? 'Save changes' : `Add ${noun}`}
            </button>
          </div>
        </>
      }
    >
      <form
        className="editor"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <input
          ref={titleRef}
          data-autofocus
          className="editor-title"
          placeholder={isTestForm ? (form.type === 'quiz' ? 'Quiz name, e.g. Quiz 4: Chapter 6' : 'Test name, e.g. Midterm 2') : 'Assignment title'}
          value={form.title}
          onChange={(e) => {
            set('title', e.target.value);
            if (error) setError('');
          }}
          aria-label={isTestForm ? 'Test name' : 'Assignment title'}
          maxLength={200}
        />
        {error && <div className="form-error">{error}</div>}

        <div className="editor-grid">
          <label className="field">
            <span className="field-label">Class</span>
            <select className="input" value={form.courseId} onChange={(e) => set('courseId', e.target.value)}>
              <option value="">No class</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.name}` : c.name}
                </option>
              ))}
              <option value={NEW_CLASS}>+ New class…</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Type</span>
            <select className="input" value={form.type} onChange={(e) => set('type', e.target.value as AssignmentType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {form.courseId === NEW_CLASS && (
            <label className="field field-span">
              <span className="field-label">New class name</span>
              <input
                className="input"
                autoFocus
                placeholder="e.g. Organic Chemistry"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
              />
            </label>
          )}

          <div className="field field-span">
            <span className="field-label">{isTestForm ? `${noun === 'quiz' ? 'Quiz' : 'Test'} date` : 'Due date'}</span>
            <div className="date-row">
              <input
                type="date"
                className="input input-date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                aria-label="Due date"
                required
              />
              <div className="chip-group">
                {quickDates.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className={`chip${form.dueDate === q.key ? ' active' : ''}`}
                    onClick={() => set('dueDate', q.key)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            {form.dueDate && form.dueDate < today && !editing && (
              <span className="field-hint warn">
                That date is in the past ({weekdayShort(fromKey(form.dueDate))}, {monthShort(fromKey(form.dueDate))}{' '}
                {fromKey(form.dueDate).getDate()}).
              </span>
            )}
          </div>

          <label className="field">
            <span className="field-label">
              {isTestForm ? 'Start time' : 'Due time'} <span className="optional">optional</span>
            </span>
            <div className="input-with-clear">
              <input type="time" className="input" value={form.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
              {form.dueTime && (
                <button type="button" className="clear-btn" onClick={() => set('dueTime', '')} aria-label="Clear time">
                  ×
                </button>
              )}
            </div>
          </label>

          <div className="field">
            <span className="field-label">Priority</span>
            <Segmented
              ariaLabel="Priority"
              value={form.priority}
              onChange={(v) => set('priority', v)}
              options={[...PRIORITIES].reverse().map((p) => ({
                value: p.value,
                label: (
                  <span className="seg-inline">
                    <PriorityFlag priority={p.value} /> {p.label}
                  </span>
                ),
              }))}
            />
          </div>

          {isTestForm && (
            <>
              <label className="field field-span">
                <span className="field-label">
                  Location <span className="optional">optional</span>
                </span>
                <input
                  id="test-location"
                  className="input"
                  placeholder="e.g. Room 204, Science Hall, or Online"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  maxLength={120}
                />
              </label>
              <div className="field field-span">
                <span className="field-label">
                  What to study <span className="optional">tick topics off as you review them</span>
                </span>
                <TopicChecklist inputId="test-topic-input" topics={form.topics} onChange={(topics) => set('topics', topics)} />
              </div>
            </>
          )}


          <button type="button" className="more-toggle field-span" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            <ChevronDown size={14} className={showMore ? 'flip' : ''} /> {showMore ? 'Fewer details' : 'More details'}
          </button>
          {showMore && (
            <>
          <label className="field">
            <span className="field-label">{isTestForm ? 'Study time needed' : 'Estimated time'}</span>
            <div className="estimate-row">
              <select className="input" value={form.estimate} onChange={(e) => set('estimate', e.target.value)}>
                <option value="">Not set</option>
                {estOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              {form.estimate === 'custom' && (
                <input
                  type="number"
                  min={5}
                  step={5}
                  className="input input-narrow"
                  placeholder="min"
                  aria-label="Custom estimate in minutes"
                  value={form.customEstimate}
                  onChange={(e) => set('customEstimate', e.target.value)}
                />
              )}
            </div>
          </label>
          <div className="field">
            <span className="field-label">Status</span>
            <Segmented
              ariaLabel="Status"
              value={form.status}
              onChange={(v) => set('status', v)}
              options={STATUSES.map((s) => ({ value: s.value, label: s.value === 'not_started' ? 'To do' : s.value === 'in_progress' ? 'Doing' : 'Done', title: s.label }))}
            />
          </div>
          <label className="field field-span">
            <span className="field-label">Notes</span>
            <textarea
              className="input textarea"
              rows={3}
              placeholder="Instructions, links, page numbers…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </label>
            </>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
