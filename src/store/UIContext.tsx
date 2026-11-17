import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Assignment, AssignmentInput } from '../types';

export interface EditorRequest {
  assignment?: Assignment;
  defaults?: Partial<AssignmentInput>;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'success' | 'danger';
  duration?: number;
}

export interface Toast extends ToastOptions {
  id: number;
  message: string;
}

export interface ConfirmRequest {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Optional checkbox shown in the dialog; its value is passed to onConfirm. */
  checkboxLabel?: string;
  onConfirm: (checked: boolean) => void;
}

interface UIValue {
  editor: EditorRequest | null;
  openEditor(req?: EditorRequest): void;
  closeEditor(): void;
  toasts: Toast[];
  toast(message: string, opts?: ToastOptions): void;
  dismissToast(id: number): void;
  confirm: ConfirmRequest | null;
  askConfirm(req: ConfirmRequest): void;
  closeConfirm(): void;
}

const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, ...opts }]);
      setTimeout(() => dismissToast(id), opts.duration ?? (opts.onAction ? 5000 : 2800));
    },
    [dismissToast],
  );

  const value = useMemo<UIValue>(
    () => ({
      editor,
      openEditor: (req = {}) => setEditor(req),
      closeEditor: () => setEditor(null),
      toasts,
      toast,
      dismissToast,
      confirm,
      askConfirm: setConfirm,
      closeConfirm: () => setConfirm(null),
    }),
    [editor, toasts, toast, dismissToast, confirm],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
