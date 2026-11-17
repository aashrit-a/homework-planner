import type { ReactNode } from 'react';
import { Circle, CircleCheck, CircleDashed, Flag } from 'lucide-react';
import type { Course, Priority, Status } from '../types';
import { NO_CLASS_COLOR } from '../lib/constants';

export function ClassTag({ course, size = 'md' }: { course: Course | null; size?: 'sm' | 'md' }) {
  const color = course?.color ?? NO_CLASS_COLOR;
  return (
    <span className={`class-tag class-tag-${size}`} style={{ '--c': color } as React.CSSProperties} title={course?.name}>
      <span className="class-dot" />
      <span className="class-tag-label">{course ? course.code || course.name : 'No class'}</span>
    </span>
  );
}

export function ClassDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="class-dot" style={{ '--c': color, width: size, height: size } as React.CSSProperties} />;
}

export function PriorityFlag({ priority, withLabel }: { priority: Priority; withLabel?: boolean }) {
  return (
    <span className={`priority priority-${priority}`} title={`${priority[0].toUpperCase()}${priority.slice(1)} priority`}>
      <Flag size={13} strokeWidth={2.2} fill={priority === 'high' ? 'currentColor' : 'none'} />
      {withLabel && <span>{priority[0].toUpperCase() + priority.slice(1)}</span>}
    </span>
  );
}

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  if (status === 'completed') return <CircleCheck size={size} className="status-icon status-completed" />;
  if (status === 'in_progress') return <CircleDashed size={size} className="status-icon status-in_progress" />;
  return <Circle size={size} className="status-icon status-not_started" />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? ' empty-compact' : ''}`}>
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-value"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className={padded ? 'card-body' : 'card-body-flush'}>{children}</div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
