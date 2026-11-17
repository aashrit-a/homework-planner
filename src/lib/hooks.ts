import { useCallback, useEffect, useState } from 'react';
import type { Priority, Status } from '../types';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { STATUS_LABEL } from './constants';

/** Current time, refreshed every minute so "due in…" labels and overdue state stay live. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** Assignment mutations that give feedback (toasts with undo). */
export function useAssignmentActions() {
  const { data, actions } = useStore();
  const { toast } = useUI();

  const toggleComplete = useCallback(
    (id: string) => {
      const a = data.assignments.find((x) => x.id === id);
      if (!a) return;
      const prev = a.status;
      actions.toggleComplete(id);
      if (prev !== 'completed') {
        toast(`Completed “${a.title}”`, {
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => actions.updateAssignment(id, { status: prev }),
        });
      }
    },
    [data.assignments, actions, toast],
  );

  const remove = useCallback(
    (id: string) => {
      const snapshot = actions.deleteAssignment(id);
      if (snapshot) {
        toast(`Deleted “${snapshot.assignment.title}”`, {
          actionLabel: 'Undo',
          onAction: () => actions.restoreAssignment(snapshot),
        });
      }
    },
    [actions, toast],
  );

  const setPriority = useCallback(
    (id: string, priority: Priority) => actions.updateAssignment(id, { priority }),
    [actions],
  );

  const setStatus = useCallback(
    (id: string, status: Status) => {
      actions.updateAssignment(id, { status });
      toast(`Marked as ${STATUS_LABEL[status].toLowerCase()}`);
    },
    [actions, toast],
  );

  const reschedule = useCallback(
    (id: string, dueDate: string) => actions.updateAssignment(id, { dueDate }),
    [actions],
  );

  return { toggleComplete, remove, setPriority, setStatus, reschedule };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}
