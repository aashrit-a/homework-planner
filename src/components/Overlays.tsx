import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useUI } from '../store/UIContext';
import { Modal } from './Modal';

export function Toasts() {
  const { toasts, dismissToast } = useUI();
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone ?? 'default'}`}>
          {t.tone === 'success' && (
            <span className="toast-icon">
              <Check size={13} strokeWidth={3} />
            </span>
          )}
          <span className="toast-msg">{t.message}</span>
          {t.onAction && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.onAction?.();
                dismissToast(t.id);
              }}
            >
              {t.actionLabel ?? 'Undo'}
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ConfirmDialog() {
  const { confirm, closeConfirm } = useUI();
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(false), [confirm]);
  if (!confirm) return null;
  return (
    <Modal
      open
      onClose={closeConfirm}
      title={confirm.title}
      size="sm"
      footer={
        <div className="footer-actions">
          <button type="button" className="btn btn-secondary" onClick={closeConfirm}>
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              confirm.onConfirm(checked);
              closeConfirm();
            }}
          >
            {confirm.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      }
    >
      {confirm.message && <div className="confirm-message">{confirm.message}</div>}
      {confirm.checkboxLabel && (
        <label className="checkbox-label">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {confirm.checkboxLabel}
        </label>
      )}
    </Modal>
  );
}
