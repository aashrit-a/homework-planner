import type { Priority } from '../types';

interface Props {
  checked: boolean;
  onChange: () => void;
  priority?: Priority;
  label: string;
  size?: 'sm' | 'md';
}

/** Round completion checkbox with priority-tinted ring and a drawn-in checkmark animation. */
export function Checkbox({ checked, onChange, priority = 'medium', label, size = 'md' }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check check-${size} check-${priority}${checked ? ' checked' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 8.5l2.5 2.5L12 5.5" />
      </svg>
    </button>
  );
}
