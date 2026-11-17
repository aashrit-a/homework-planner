import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Plus, Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import type { Assignment, AssignmentType, Priority } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useNow } from '../lib/hooks';
import { bucketByDue, compareByDue, compareByPriority, isDone, isOverdue, weekRangeKeys } from '../lib/planning';
import { PRIORITIES, TYPES } from '../lib/constants';
import { navigate, type Route } from '../lib/router';
import { AssignmentRow } from '../components/AssignmentRow';
import { QuickAdd } from '../components/QuickAdd';
import { EmptyState, PageHeader, Segmented } from '../components/ui';
import { toKey } from '../lib/date';

type StatusFilter = 'active' | 'all' | 'not_started' | 'in_progress' | 'completed';
type SortKey = 'due' | 'priority' | 'class' | 'created';
type View = '' | 'today' | 'week' | 'overdue';

const VIEW_LABEL: Record<Exclude<View, ''>, string> = { today: 'Due today', week: 'Due this week', overdue: 'Overdue' };

export function Assignments({ route }: { route: Route }) {
  const { data } = useStore();
  const { courses, getCourse } = useCourses();
  const { openEditor } = useUI();
  const now = useNow();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const initialView = route.query.get('view');
  const [status, setStatus] = useState<StatusFilter>(initialView === 'completed' ? 'completed' : 'active');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [type, setType] = useState<AssignmentType | ''>('');
  const [sort, setSort] = useState<SortKey>('due');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<View>(
    initialView === 'today' || initialView === 'week' || initialView === 'overdue' ? initialView : '',
  );
  const [showCompleted, setShowCompleted] = useState(false);

  // Deep links from dashboard cards: #/assignments?view=overdue, ?class=id, ?q=...
  useEffect(() => {
    const v = route.query.get('view');
    if (v === 'completed') {
      setStatus('completed');
      setView('');
    } else if (v === 'today' || v === 'week' || v === 'overdue') {
      setView(v);
      setStatus('active');
    } else setView('');
    const c = route.query.get('class');
    if (c) setCourseFilter(c);
    const q = route.query.get('q');
    if (q !== null) setQuery(q);
    if (route.query.get('focus') === 'search') requestAnimationFrame(() => searchRef.current?.focus());
  }, [route.query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = toKey(now);
    const [ws, we] = weekRangeKeys(now);
    return data.assignments.filter((a) => {
      if (q && !a.title.toLowerCase().includes(q) && !a.notes.toLowerCase().includes(q)) return false;
      if (courseFilter === 'none' ? a.courseId !== null : courseFilter && a.courseId !== courseFilter) return false;
      if (priority && a.priority !== priority) return false;
      if (type && a.type !== type) return false;
      if (status === 'active' && isDone(a)) return false;
      if (status !== 'active' && status !== 'all' && a.status !== status) return false;
      if (view === 'today' && a.dueDate !== today) return false;
      if (view === 'week' && (a.dueDate < ws || a.dueDate > we)) return false;
      if (view === 'overdue' && !isOverdue(a, now)) return false;
      return true;
    });
  }, [data.assignments, query, courseFilter, priority, type, status, view, now]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === 'due') list.sort(compareByDue);
    if (sort === 'priority') list.sort(compareByPriority);
    if (sort === 'created') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === 'class') {
      const order = new Map(courses.map((c, i) => [c.id, i]));
      list.sort((a, b) => (order.get(a.courseId ?? '') ?? 999) - (order.get(b.courseId ?? '') ?? 999) || compareByDue(a, b));
    }
    return list;
  }, [filtered, sort, courses]);

  const activeFilterCount = [query, courseFilter, priority, type, view].filter(Boolean).length + (status !== 'active' ? 1 : 0);
  const clearFilters = () => {
    setQuery('');
    setCourseFilter('');
    setPriority('');
    setType('');
    setStatus('active');
    setView('');
    if (route.query.toString()) navigate('/assignments');
  };

  const extraFilterCount = [courseFilter, priority, type].filter(Boolean).length + (sort !== 'due' ? 1 : 0);

  return (
    <div className="page">
      <PageHeader title="Assignments" />

      <QuickAdd defaultCourseId={courseFilter && courseFilter !== 'none' ? courseFilter : undefined} />

      <div className="toolbar">
        <div className="search">
          <Search size={15} className="search-icon" />
          <input
            ref={searchRef}
            id="assignment-search"
            className="search-input"
            placeholder="Search assignments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            aria-label="Search assignments"
          />
          {query && (
            <button type="button" className="clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
        <Segmented<StatusFilter>
          size="sm"
          ariaLabel="Status filter"
          value={status}
          onChange={(v) => {
            setStatus(v);
            if (v === 'completed') setView('');
          }}
          options={[
            { value: 'active', label: 'Open' },
            { value: 'completed', label: 'Done' },
            { value: 'all', label: 'All' },
          ]}
        />
        <button
          type="button"
          className={`btn btn-ghost btn-sm filters-toggle${showFilters || extraFilterCount ? ' active' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={14} /> Filters{extraFilterCount ? ` · ${extraFilterCount}` : ''}
        </button>
      </div>
      {showFilters && (
        <div className="toolbar-selects">
          <FilterSelect label="Class" value={courseFilter} onChange={setCourseFilter}>
            <option value="">All classes</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code || c.name}
              </option>
            ))}
            <option value="none">No class</option>
          </FilterSelect>
          <FilterSelect label="Priority" value={priority} onChange={(v) => setPriority(v as Priority | '')}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Type" value={type} onChange={(v) => setType(v as AssignmentType | '')}>
            <option value="">Any type</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)} plain>
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="class">Sort: Class</option>
            <option value="created">Sort: Recently added</option>
          </FilterSelect>
        </div>
      )}

      {(view || activeFilterCount > 0) && (
        <div className="filter-summary">
          {view && (
            <span className="chip active">
              {VIEW_LABEL[view]}
              <button type="button" onClick={() => { setView(''); navigate('/assignments'); }} aria-label="Remove view filter">
                <X size={12} />
              </button>
            </span>
          )}
          <span className="muted small">
            {sorted.length} result{sorted.length === 1 ? '' : 's'}
          </span>
          {activeFilterCount > 0 && (
            <button type="button" className="link-btn" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="card list-card">
        {sorted.length === 0 ? (
          data.assignments.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="No assignments yet"
              description="Add your first assignment above, or use the button to open the full form."
              action={
                <button type="button" className="btn btn-primary" onClick={() => openEditor()}>
                  <Plus size={16} /> Add assignment
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<Search size={20} />}
              title={status === 'active' && !query && !view ? 'All caught up' : 'No matching assignments'}
              description={status === 'active' && !query && !view ? 'Every assignment matching these filters is complete.' : 'Try a different search or clear the filters.'}
              action={
                activeFilterCount > 0 ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )
        ) : sort === 'due' ? (
          <GroupedList list={sorted} now={now} getCourse={getCourse} showCompleted={showCompleted} setShowCompleted={setShowCompleted} forceCompleted={status === 'completed'} />
        ) : (
          sorted.map((a) => <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />)
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  plain,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  plain?: boolean;
}) {
  return (
    <label className={`filter-select${value && !plain ? ' has-value' : ''}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={13} className="filter-chevron" />
    </label>
  );
}

const GROUPS: { key: keyof ReturnType<typeof bucketByDue>; label: string; tone?: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'thisWeek', label: 'Later this week' },
  { key: 'nextWeek', label: 'Next week' },
  { key: 'later', label: 'Later' },
];

function GroupedList({
  list,
  now,
  getCourse,
  showCompleted,
  setShowCompleted,
  forceCompleted,
}: {
  list: Assignment[];
  now: Date;
  getCourse: ReturnType<typeof useCourses>['getCourse'];
  showCompleted: boolean;
  setShowCompleted: (v: boolean) => void;
  forceCompleted: boolean;
}) {
  const buckets = bucketByDue(list, now);
  const completed = [...buckets.completed].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return (
    <>
      {GROUPS.map(({ key, label, tone }) => {
        const items = buckets[key];
        if (!items.length) return null;
        return (
          <div className="group" key={key}>
            <div className={`group-label${tone ? ` group-label-${tone}` : ''}`}>
              {label} <span className="group-count">{items.length}</span>
            </div>
            {items.map((a) => (
              <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />
            ))}
          </div>
        );
      })}
      {completed.length > 0 && (
        <div className="group">
          {forceCompleted ? (
            <div className="group-label">
              Completed <span className="group-count">{completed.length}</span>
            </div>
          ) : (
            <button type="button" className="group-label group-toggle" onClick={() => setShowCompleted(!showCompleted)} aria-expanded={showCompleted}>
              <ChevronDown size={13} className={showCompleted ? '' : 'rot-90'} /> Completed <span className="group-count">{completed.length}</span>
            </button>
          )}
          {(showCompleted || forceCompleted) &&
            completed.map((a) => <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />)}
        </div>
      )}
    </>
  );
}
