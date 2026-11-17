import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, MoreHorizontal, Pencil, Plus, Trash2, User } from 'lucide-react';
import type { Course, CourseInput } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useNow } from '../lib/hooks';
import { CLASS_COLORS } from '../lib/constants';
import { compareByDue, isDone, isOverdue, sumMinutes } from '../lib/planning';
import { formatDue, formatMinutes } from '../lib/date';
import { href, navigate } from '../lib/router';
import { Modal } from '../components/Modal';
import { Menu } from '../components/Menu';
import { AssignmentRow } from '../components/AssignmentRow';
import { QuickAdd } from '../components/QuickAdd';
import { EmptyState, PageHeader, Segmented } from '../components/ui';

function useCourseEditor() {
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  return { editing, openNew: () => setEditing('new'), openEdit: (c: Course) => setEditing(c), close: () => setEditing(null) };
}

function useDeleteCourse() {
  const { data, actions } = useStore();
  const { askConfirm, toast } = useUI();
  return (c: Course, after?: () => void) => {
    const count = data.assignments.filter((a) => a.courseId === c.id).length;
    askConfirm({
      title: `Delete ${c.code || c.name}?`,
      message: count
        ? `This class has ${count} assignment${count === 1 ? '' : 's'}. They’ll be kept and moved to “No class” unless you choose to delete them too.`
        : 'This class has no assignments.',
      checkboxLabel: count ? `Also delete its ${count} assignment${count === 1 ? '' : 's'}` : undefined,
      confirmLabel: 'Delete class',
      danger: true,
      onConfirm: (deleteAssignments) => {
        actions.deleteCourse(c.id, deleteAssignments);
        toast(`Deleted ${c.code || c.name}`);
        after?.();
      },
    });
  };
}

export function Classes({ openNew = false }: { openNew?: boolean }) {
  const { data } = useStore();
  const editor = useCourseEditor();
  // `#classes--new-1` opens the "New class" form straight away (used by the dashboard's getting-started steps).
  useEffect(() => {
    if (openNew) {
      editor.openNew();
      navigate('/classes');
    }
  }, [openNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const deleteCourse = useDeleteCourse();
  const now = useNow();

  const stats = useMemo(
    () =>
      data.courses.map((c) => {
        const list = data.assignments.filter((a) => a.courseId === c.id);
        const open = list.filter((a) => !isDone(a)).sort(compareByDue);
        return {
          c,
          total: list.length,
          done: list.length - open.length,
          open: open.length,
          overdue: open.filter((a) => isOverdue(a, now)).length,
          next: open.find((a) => !isOverdue(a, now)),
          minutes: sumMinutes(open),
        };
      }),
    [data.courses, data.assignments, now],
  );

  return (
    <div className="page">
      <PageHeader
        title="My Classes"
        subtitle={`${data.courses.length} class${data.courses.length === 1 ? '' : 'es'} this term`}
        actions={
          <button type="button" className="btn btn-primary" onClick={editor.openNew}>
            <Plus size={16} /> Add class
          </button>
        }
      />

      {data.courses.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpen size={22} />}
            title="No classes yet"
            description="Add your classes to color-code assignments and see workload per subject."
            action={
              <button type="button" className="btn btn-primary" onClick={editor.openNew}>
                <Plus size={16} /> Add your first class
              </button>
            }
          />
        </div>
      ) : (
        <div className="class-grid">
          {stats.map(({ c, total, done, open, overdue, next, minutes }) => (
            <article key={c.id} className="class-card" style={{ '--c': c.color } as React.CSSProperties}>
              <a href={href(`/classes/${c.id}`)} className="class-card-link" aria-label={`Open ${c.name}`} />
              <div className="class-card-head">
                <span className="class-swatch" />
                <div className="class-card-titles">
                  <div className="class-code">{c.code || 'Class'}</div>
                  <h3 className="class-name">{c.name}</h3>
                </div>
                <Menu
                  label="Class actions"
                  items={[
                    { label: 'Edit class', icon: <Pencil size={14} />, onSelect: () => editor.openEdit(c) },
                    { label: 'Delete class', icon: <Trash2 size={14} />, danger: true, onSelect: () => deleteCourse(c) },
                  ]}
                  trigger={(t) => (
                    <button type="button" className="icon-btn icon-btn-sm class-card-menu" aria-label="Class actions" {...t}>
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                />
              </div>
              {c.teacher && (
                <div className="class-teacher">
                  <User size={13} /> {c.teacher}
                </div>
              )}
              <div className="class-stats">
                <div>
                  <span className="class-stat-num">{open}</span> open
                </div>
                <div>
                  <span className="class-stat-num">{done}</span> done
                </div>
                {overdue > 0 && (
                  <div className="text-danger">
                    <span className="class-stat-num">{overdue}</span> overdue
                  </div>
                )}
                {minutes > 0 && <div className="muted">{formatMinutes(minutes)} left</div>}
              </div>
              <div className="bar bar-sm">
                <div className="bar-fill" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: c.color }} />
              </div>
              <div className="class-next">
                {next ? (
                  <>
                    <span className="muted">Next:</span> <span className="truncate">{next.title}</span>
                    <span className="class-next-due">{formatDue(next.dueDate, next.dueTime)}</span>
                  </>
                ) : (
                  <span className="muted">No upcoming deadlines</span>
                )}
              </div>
            </article>
          ))}
          <button type="button" className="class-card class-card-add" onClick={editor.openNew}>
            <Plus size={18} /> Add class
          </button>
        </div>
      )}

      <CourseEditorModal state={editor.editing} onClose={editor.close} />
    </div>
  );
}

export function ClassDetail({ id }: { id: string }) {
  const { data } = useStore();
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const editor = useCourseEditor();
  const deleteCourse = useDeleteCourse();
  const now = useNow();
  const course = getCourse(id);
  const [filter, setFilter] = useState<'open' | 'completed' | 'all'>('open');

  const list = useMemo(() => data.assignments.filter((a) => a.courseId === id).sort(compareByDue), [data.assignments, id]);

  if (!course) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState title="Class not found" description="It may have been deleted." action={<a className="btn btn-secondary" href={href('/classes')}>Back to classes</a>} />
        </div>
      </div>
    );
  }

  const open = list.filter((a) => !isDone(a));
  const done = list.length - open.length;
  const shown = filter === 'open' ? open : filter === 'completed' ? list.filter(isDone).reverse() : list;

  return (
    <div className="page">
      <a href={href('/classes')} className="back-link">
        <ArrowLeft size={14} /> All classes
      </a>
      <header className="class-hero" style={{ '--c': course.color } as React.CSSProperties}>
        <span className="class-hero-swatch" />
        <div className="class-hero-text">
          <div className="class-code">{course.code || 'Class'}</div>
          <h1 className="page-title">{course.name}</h1>
          <div className="muted small class-hero-meta">
            {course.teacher && (
              <span>
                <User size={13} /> {course.teacher}
              </span>
            )}
            <span>
              {open.length} open · {done} completed
            </span>
            {sumMinutes(open) > 0 && <span>{formatMinutes(sumMinutes(open))} of work left</span>}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => editor.openEdit(course)}>
            <Pencil size={14} /> Edit
          </button>
          <button type="button" className="icon-btn" onClick={() => deleteCourse(course, () => navigate('/classes'))} aria-label="Delete class">
            <Trash2 size={15} />
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openEditor({ defaults: { courseId: course.id } })}>
            <Plus size={14} /> Add
          </button>
        </div>
      </header>

      <QuickAdd defaultCourseId={course.id} placeholder={`Add to ${course.code || course.name} — e.g. “Problem set 9 fri 5pm”`} />

      <div className="toolbar">
        <Segmented
          size="sm"
          ariaLabel="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Open (${open.length})` },
            { value: 'completed', label: `Done (${done})` },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <div className="card list-card">
        {shown.length === 0 ? (
          <EmptyState compact title={filter === 'open' ? 'Nothing open for this class' : 'Nothing here yet'} />
        ) : (
          shown.map((a) => <AssignmentRow key={a.id} assignment={a} course={course} now={now} showClass={false} />)
        )}
      </div>
      <CourseEditorModal state={editor.editing} onClose={editor.close} />
    </div>
  );
}

export function CourseEditorModal({ state, onClose }: { state: Course | 'new' | null; onClose: () => void }) {
  const { data, actions } = useStore();
  const { toast } = useUI();
  const editing = state && state !== 'new' ? state : null;
  const [form, setForm] = useState<CourseInput>({ name: '', code: '', teacher: '', color: CLASS_COLORS[0] });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!state) return;
    if (state === 'new') {
      const used = new Set(data.courses.map((c) => c.color));
      setForm({ name: '', code: '', teacher: '', color: CLASS_COLORS.find((c) => !used.has(c)) ?? CLASS_COLORS[0] });
    } else {
      setForm({ name: state.name, code: state.code, teacher: state.teacher, color: state.color });
    }
    setError('');
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const name = form.name.trim();
    if (!name) {
      setError('Class name is required.');
      return;
    }
    const clean = { ...form, name, code: form.code.trim(), teacher: form.teacher.trim() };
    if (editing) {
      actions.updateCourse(editing.id, clean);
      toast('Class updated');
    } else {
      actions.addCourse(clean);
      toast(`Added ${clean.code || clean.name}`, { tone: 'success' });
    }
    onClose();
  };

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={editing ? 'Edit class' : 'New class'}
      size="sm"
      footer={
        <div className="footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {editing ? 'Save' : 'Add class'}
          </button>
        </div>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span className="field-label">Class name</span>
          <input data-autofocus className="input" placeholder="e.g. Organic Chemistry" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-row">
          <label className="field">
            <span className="field-label">
              Short code <span className="optional">optional</span>
            </span>
            <input className="input" placeholder="CHEM 210" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={16} />
          </label>
          <label className="field">
            <span className="field-label">
              Teacher <span className="optional">optional</span>
            </span>
            <input className="input" placeholder="Dr. Smith" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} maxLength={60} />
          </label>
        </div>
        <div className="field">
          <span className="field-label">Color</span>
          <div className="swatches" role="radiogroup" aria-label="Class color">
            {CLASS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color === c}
                aria-label={c}
                className={`swatch${form.color === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => setForm({ ...form, color: c })}
              />
            ))}
            <label className={`swatch swatch-custom${!CLASS_COLORS.includes(form.color) ? ' active' : ''}`} title="Custom color" style={!CLASS_COLORS.includes(form.color) ? { background: form.color } : undefined}>
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label="Custom color" />
              {CLASS_COLORS.includes(form.color) && <Plus size={13} />}
            </label>
          </div>
        </div>
        <div className="class-preview" style={{ '--c': form.color } as React.CSSProperties}>
          <span className="class-dot" /> {form.code || form.name || 'Preview'}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
