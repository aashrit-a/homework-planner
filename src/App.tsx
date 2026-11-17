import { useEffect, useRef } from 'react';
import { AppStoreProvider } from './store/AppStore';
import { UIProvider, useUI } from './store/UIContext';
import { navigate, useRoute } from './lib/router';
import { isTypingTarget } from './lib/hooks';
import { MobileNav, Sidebar, useAppTheme } from './components/Navigation';
import { applyThemePreference } from './lib/theme';
import { useStore } from './store/AppStore';
import { AssignmentEditor } from './components/AssignmentEditor';
import { ConfirmDialog, Toasts } from './components/Overlays';
import { Dashboard } from './pages/Dashboard';
import { Assignments } from './pages/Assignments';
import { WeeklyPlanner } from './pages/WeeklyPlanner';
import { CalendarPage } from './pages/CalendarPage';
import { ClassDetail, Classes } from './pages/Classes';
import { StudyPlanner } from './pages/StudyPlanner';
import { Settings } from './pages/Settings';
import { Tests } from './pages/Tests';
import { EmptyState } from './components/ui';
import { href } from './lib/router';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/assignments': 'Assignments',
  '/tests': 'Upcoming Tests',
  '/planner': 'Weekly Planner',
  '/calendar': 'Calendar',
  '/classes': 'Classes',
  '/study': 'Study Planner',
  '/settings': 'Settings',
};

function Shell() {
  const route = useRoute();
  const { openEditor, editor, confirm } = useUI();
  const { data } = useStore();
  const theme = useAppTheme();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => applyThemePreference(data.settings.theme), [data.settings.theme]);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111113' : '#fbfbfa');
  }, [theme]);

  useEffect(() => {
    const base = '/' + (route.segments[0] ?? '');
    document.title = `${TITLES[base] ?? 'Margin'} · Margin`;
    window.scrollTo(0, 0);
  }, [route.path]);

  // Global shortcuts: N = new, / = search, G then D/A/W/C/S/P/K = go to page.
  useEffect(() => {
    let gPressed = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || editor || confirm || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (gPressed && Date.now() - gPressed < 1000) {
        const map: Record<string, string> = { d: '/', a: '/assignments', t: '/tests', w: '/planner', c: '/calendar', k: '/classes', s: '/study', p: '/study', ',': '/settings' };
        gPressed = 0;
        if (map[k]) {
          e.preventDefault();
          navigate(map[k]);
          return;
        }
      }
      if (k === 'g') {
        gPressed = Date.now();
      } else if (k === 'n') {
        e.preventDefault();
        openEditor();
      } else if (k === '/') {
        e.preventDefault();
        const el = document.getElementById('assignment-search');
        if (el) el.focus();
        else navigate('/assignments?focus=search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEditor, editor, confirm]);

  const [first, second] = route.segments;
  let page: React.ReactNode;
  switch (first) {
    case undefined:
      page = <Dashboard />;
      break;
    case 'assignments':
      page = <Assignments route={route} />;
      break;
    case 'tests':
      page = <Tests />;
      break;
    case 'planner':
      page = <WeeklyPlanner route={route} />;
      break;
    case 'calendar':
      page = <CalendarPage />;
      break;
    case 'classes':
      page = second ? <ClassDetail id={second} /> : <Classes openNew={route.query.get('new') === '1'} />;
      break;
    case 'study':
      page = <StudyPlanner />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    default:
      page = (
        <div className="page">
          <div className="card">
            <EmptyState title="Page not found" action={<a className="btn btn-secondary" href={href('/')}>Go to dashboard</a>} />
          </div>
        </div>
      );
  }

  return (
    <div className="app">
      <Sidebar path={route.path} />
      <MobileNav path={route.path} />
      <main className="main" ref={mainRef} key={route.path}>
        {page}
      </main>
      <AssignmentEditor />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <AppStoreProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </AppStoreProvider>
  );
}
