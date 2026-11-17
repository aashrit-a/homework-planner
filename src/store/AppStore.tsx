import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { AppData, Assignment, AssignmentInput, Course, CourseInput, Settings, Status } from '../types';
import { createEmptyData, LocalStorageAdapter, type PersistenceAdapter } from '../lib/storage';
import { uid } from '../lib/id';

type Action =
  | { type: 'assignment/add'; assignment: Assignment }
  | { type: 'assignment/update'; id: string; patch: Partial<AssignmentInput> }
  | { type: 'assignment/delete'; id: string }
  | { type: 'assignment/restore'; assignment: Assignment; planDays: string[] }
  | { type: 'course/add'; course: Course }
  | { type: 'course/update'; id: string; patch: Partial<CourseInput> }
  | { type: 'course/delete'; id: string; deleteAssignments: boolean }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'plan/set'; day: string; ids: string[] }
  /**
   * `remote` applies data that came from sync as-is. `user` is an import or
   * "start fresh": anything not in the new data is recorded as deleted so other
   * devices drop it too, and everything kept counts as just edited.
   */
  | { type: 'data/replace'; data: AppData; origin: 'remote' | 'user' };

const nowIso = () => new Date().toISOString();

function applyStatus(a: Assignment, status: Status | undefined): Pick<Assignment, 'status' | 'completedAt'> {
  if (!status || status === a.status) return { status: a.status, completedAt: a.completedAt };
  return { status, completedAt: status === 'completed' ? nowIso() : null };
}

function removeFromPlans(plan: AppData['studyPlan'], ids: Set<string>): AppData['studyPlan'] {
  const next: AppData['studyPlan'] = {};
  for (const [day, list] of Object.entries(plan)) {
    const filtered = list.filter((id) => !ids.has(id));
    if (filtered.length) next[day] = filtered;
  }
  return next;
}

function withDeleted(state: AppData, ids: Iterable<string>): AppData['deleted'] {
  const at = nowIso();
  const next = { ...state.deleted };
  for (const id of ids) next[id] = at;
  return next;
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'assignment/add':
      return { ...state, assignments: [...state.assignments, action.assignment] };
    case 'assignment/update':
      return {
        ...state,
        assignments: state.assignments.map((a) =>
          a.id === action.id
            ? { ...a, ...action.patch, ...applyStatus(a, action.patch.status), updatedAt: nowIso() }
            : a,
        ),
      };
    case 'assignment/delete':
      return {
        ...state,
        assignments: state.assignments.filter((a) => a.id !== action.id),
        studyPlan: removeFromPlans(state.studyPlan, new Set([action.id])),
        planUpdatedAt: nowIso(),
        deleted: withDeleted(state, [action.id]),
      };
    case 'assignment/restore': {
      const plan = { ...state.studyPlan };
      for (const day of action.planDays) plan[day] = [...(plan[day] ?? []), action.assignment.id];
      const deleted = { ...state.deleted };
      delete deleted[action.assignment.id];
      // Count the undo as an edit so it outranks the deletion on other devices.
      const assignment = { ...action.assignment, updatedAt: nowIso() };
      return { ...state, assignments: [...state.assignments, assignment], studyPlan: plan, planUpdatedAt: nowIso(), deleted };
    }
    case 'course/add':
      return { ...state, courses: [...state.courses, action.course] };
    case 'course/update':
      return {
        ...state,
        courses: state.courses.map((c) => (c.id === action.id ? { ...c, ...action.patch, updatedAt: nowIso() } : c)),
      };
    case 'course/delete': {
      const removed = new Set(
        action.deleteAssignments ? state.assignments.filter((a) => a.courseId === action.id).map((a) => a.id) : [],
      );
      const ts = nowIso();
      return {
        ...state,
        courses: state.courses.filter((c) => c.id !== action.id),
        assignments: state.assignments
          .filter((a) => !removed.has(a.id))
          .map((a) => (a.courseId === action.id ? { ...a, courseId: null, updatedAt: ts } : a)),
        studyPlan: removed.size ? removeFromPlans(state.studyPlan, removed) : state.studyPlan,
        planUpdatedAt: removed.size ? ts : state.planUpdatedAt,
        deleted: withDeleted(state, [action.id, ...removed]),
      };
    }
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch }, settingsUpdatedAt: nowIso() };
    case 'plan/set': {
      const plan = { ...state.studyPlan };
      if (action.ids.length) plan[action.day] = [...new Set(action.ids)];
      else delete plan[action.day];
      return { ...state, studyPlan: plan, planUpdatedAt: nowIso() };
    }
    case 'data/replace': {
      if (action.origin === 'remote') return action.data;
      const ts = nowIso();
      const kept = new Set([...action.data.courses, ...action.data.assignments].map((x) => x.id));
      const removed = [...state.courses, ...state.assignments].map((x) => x.id).filter((id) => !kept.has(id));
      const deleted = { ...action.data.deleted, ...withDeleted(state, removed) };
      for (const id of kept) delete deleted[id];
      return {
        ...action.data,
        courses: action.data.courses.map((c) => ({ ...c, updatedAt: ts })),
        assignments: action.data.assignments.map((a) => ({ ...a, updatedAt: ts })),
        settingsUpdatedAt: ts,
        planUpdatedAt: ts,
        deleted,
      };
    }
  }
}

export interface AppActions {
  addAssignment(input: AssignmentInput): Assignment;
  updateAssignment(id: string, patch: Partial<AssignmentInput>): void;
  deleteAssignment(id: string): { assignment: Assignment; planDays: string[] } | null;
  restoreAssignment(snapshot: { assignment: Assignment; planDays: string[] }): void;
  toggleComplete(id: string): void;
  addCourse(input: CourseInput): Course;
  updateCourse(id: string, patch: Partial<CourseInput>): void;
  deleteCourse(id: string, deleteAssignments: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
  setPlan(day: string, ids: string[]): void;
  /** Replace everything (import, start fresh). Removed items are recorded as deleted. */
  replaceData(data: AppData): void;
  /** Apply data received from sync exactly as given. */
  applyRemoteData(data: AppData): void;
}

interface StoreValue {
  data: AppData;
  actions: AppActions;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({
  children,
  adapter = defaultAdapter,
}: {
  children: ReactNode;
  adapter?: PersistenceAdapter;
}) {
  const [data, dispatch] = useReducer(reducer, undefined, () => adapter.load() ?? createEmptyData());
  const dataRef = useRef(data);
  dataRef.current = data;
  const skipSave = useRef(false);

  // Auto-save (debounced) on every change.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const t = setTimeout(() => adapter.save(data), 120);
    return () => clearTimeout(t);
  }, [data, adapter]);

  // Flush on tab close so nothing is lost inside the debounce window.
  useEffect(() => {
    const flush = () => adapter.save(dataRef.current);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [adapter]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    if (!adapter.subscribe) return;
    return adapter.subscribe((incoming) => {
      skipSave.current = true;
      dispatch({ type: 'data/replace', data: incoming, origin: 'remote' });
    });
  }, [adapter]);

  const actions = useMemo<AppActions>(
    () => ({
      addAssignment(input) {
        const ts = nowIso();
        const assignment: Assignment = {
          location: '',
          topics: [],
          ...input,
          id: uid('a_'),
          completedAt: input.status === 'completed' ? ts : null,
          createdAt: ts,
          updatedAt: ts,
        };
        dispatch({ type: 'assignment/add', assignment });
        return assignment;
      },
      updateAssignment(id, patch) {
        dispatch({ type: 'assignment/update', id, patch });
      },
      deleteAssignment(id) {
        const current = dataRef.current;
        const assignment = current.assignments.find((a) => a.id === id);
        if (!assignment) return null;
        const planDays = Object.entries(current.studyPlan)
          .filter(([, ids]) => ids.includes(id))
          .map(([day]) => day);
        dispatch({ type: 'assignment/delete', id });
        return { assignment, planDays };
      },
      restoreAssignment(snapshot) {
        dispatch({ type: 'assignment/restore', ...snapshot });
      },
      toggleComplete(id) {
        const a = dataRef.current.assignments.find((x) => x.id === id);
        if (!a) return;
        dispatch({
          type: 'assignment/update',
          id,
          patch: { status: a.status === 'completed' ? 'not_started' : 'completed' },
        });
      },
      addCourse(input) {
        const ts = nowIso();
        const course: Course = { ...input, id: uid('c_'), createdAt: ts, updatedAt: ts };
        dispatch({ type: 'course/add', course });
        return course;
      },
      updateCourse(id, patch) {
        dispatch({ type: 'course/update', id, patch });
      },
      deleteCourse(id, deleteAssignments) {
        dispatch({ type: 'course/delete', id, deleteAssignments });
      },
      updateSettings(patch) {
        dispatch({ type: 'settings/update', patch });
      },
      setPlan(day, ids) {
        dispatch({ type: 'plan/set', day, ids });
      },
      replaceData(next) {
        dispatch({ type: 'data/replace', data: next, origin: 'user' });
      },
      applyRemoteData(next) {
        dispatch({ type: 'data/replace', data: next, origin: 'remote' });
      },
    }),
    [],
  );

  const value = useMemo(() => ({ data, actions }), [data, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

const defaultAdapter = new LocalStorageAdapter();

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider');
  return ctx;
}

export function useCourses() {
  const { data } = useStore();
  const map = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const get = useCallback((id: string | null) => (id ? map.get(id) ?? null : null), [map]);
  return { courses: data.courses, getCourse: get };
}
