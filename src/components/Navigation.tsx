import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  Menu as MenuIcon,
  Moon,
  Plus,
  Settings,
  Sun,
  Target,
  X,
} from 'lucide-react';
import { href } from '../lib/router';
import { useResolvedTheme } from '../lib/theme';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { isDone, isOverdue } from '../lib/planning';
import { ClassDot, Kbd } from './ui';

export const NAV = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/assignments', label: 'My Assignments', short: 'Tasks', icon: ListTodo },
  { path: '/tests', label: 'Upcoming Tests', short: 'Tests', icon: GraduationCap },
  { path: '/planner', label: 'Weekly Planner', short: 'Week', icon: CalendarRange },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/classes', label: 'My Classes', short: 'Classes', icon: BookOpen },
  { path: '/study', label: 'Study Planner', short: 'Study', icon: Target },
  { path: '/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(current: string, path: string) {
  return path === '/' ? current === '/' : current === path || current.startsWith(path + '/');
}

export function Logo() {
  return (
    <a href={href('/')} className="logo" aria-label="Margin home">
      <span className="logo-mark">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="var(--accent)" />
          <path d="M9 22V10l7 7 7-7v12" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="logo-text">Margin</span>
    </a>
  );
}

export function useAppTheme(): 'light' | 'dark' {
  const { data } = useStore();
  return useResolvedTheme(data.settings.theme);
}

export function Sidebar({ path }: { path: string }) {
  const { data, actions } = useStore();
  const { openEditor } = useUI();
  const theme = useAppTheme();
  const counts = useMemo(() => {
    const now = new Date();
    const active = data.assignments.filter((a) => !isDone(a));
    return { active: active.length, overdue: active.filter((a) => isOverdue(a, now)).length };
  }, [data.assignments]);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Logo />
      </div>
      <button type="button" className="btn btn-primary btn-block sidebar-add" onClick={() => openEditor()}>
        <Plus size={16} /> Add assignment
        <Kbd>N</Kbd>
      </button>
      <nav className="nav" aria-label="Main">
        {NAV.map(({ path: p, label, icon: Icon }) => (
          <a key={p} href={href(p)} className={`nav-item${isActive(path, p) ? ' active' : ''}`} aria-current={isActive(path, p) ? 'page' : undefined}>
            <Icon size={17} strokeWidth={1.9} />
            <span>{label}</span>
            {p === '/assignments' && counts.active > 0 && (
              <span className={`nav-count${counts.overdue ? ' nav-count-alert' : ''}`} title={counts.overdue ? `${counts.overdue} overdue` : undefined}>
                {counts.active}
              </span>
            )}
          </a>
        ))}
      </nav>

      {data.courses.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">Classes</div>
          <div className="sidebar-classes">
            {data.courses.map((c) => (
              <a key={c.id} href={href(`/classes/${c.id}`)} className={`nav-item nav-class${path === `/classes/${c.id}` ? ' active' : ''}`}>
                <ClassDot color={c.color} />
                <span className="truncate">{c.code || c.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="avatar">{(data.settings.userName || 'S').slice(0, 1).toUpperCase()}</span>
          <span className="truncate">{data.settings.userName || 'Student'}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => actions.updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  );
}

const MOBILE_PRIMARY = ['/', '/assignments', '/tests', '/planner'];

export function MobileNav({ path }: { path: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { openEditor } = useUI();
  useEffect(() => setMoreOpen(false), [path]);
  const more = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.path));
  const moreActive = more.some((n) => isActive(path, n.path));

  return (
    <>
      <header className="mobile-top">
        <Logo />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => openEditor()}>
          <Plus size={15} /> Add
        </button>
      </header>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.path)).map(({ path: p, label, icon: Icon, ...rest }) => (
          <a key={p} href={href(p)} className={`bottom-item${isActive(path, p) ? ' active' : ''}`}>
            <Icon size={20} strokeWidth={1.9} />
            <span>{'short' in rest ? rest.short : label}</span>
          </a>
        ))}
        <button type="button" className={`bottom-item${moreActive || moreOpen ? ' active' : ''}`} onClick={() => setMoreOpen((o) => !o)}>
          {moreOpen ? <X size={20} /> : <MenuIcon size={20} strokeWidth={1.9} />}
          <span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="sheet" role="menu">
            {more.map(({ path: p, label, icon: Icon }) => (
              <a key={p} href={href(p)} className={`sheet-item${isActive(path, p) ? ' active' : ''}`} role="menuitem">
                <Icon size={18} /> {label}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
