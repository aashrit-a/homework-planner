# Margin — Homework Tracker & Academic Planner

A fast, minimal planner for college coursework: assignments, a weekly planner, a calendar, classes and a study planner. Data is saved automatically in the browser.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (static, deploy anywhere)
npm run preview    # serve the production build
```

The build is fully static and uses hash routing, so `dist/` can be hosted on Netlify, Vercel, GitHub Pages or opened from any static server with no extra configuration.

## Features

- **Dashboard**: greeting, a one-line summary of the workload, four stat cards (each links to a filtered list), today's tasks with overdue items first, upcoming deadlines for the next 7 days, a weekly progress ring and a workload-per-day chart.
- **Assignments**: quick-add bar, a full editor with "Save & add another", search, filters (class, status, priority, type), sorting (due, priority, class, recently added), grouping by due date, changing priority and status from the row, and delete with undo.
- **Weekly Planner**: Monday–Sunday board with week navigation and today highlighted. Each day shows its count, and a workload chart flags the busiest day. Drag a card to another day to reschedule it. Click a day for details, or add straight to a day.
- **Calendar**: month and week views (the week view is a time grid with a "now" line). Assignments are color-coded by class. Click an assignment to edit it, click a day to see its list, use `+` (or double-click) to add on that date.
- **Classes**: add, edit and delete classes with a name, short code, teacher and color (12 presets plus a custom picker). Each class has its own page listing its assignments.
- **Study Planner**: a suggested order ranked by deadline, priority, type and effort. Build a daily plan by hand (drag, ↑/↓, remove) or use Auto-fill up to your daily goal.
- **Settings**: name, light/dark/system theme, daily study goal, JSON export and import (validated), load sample data, clear all.

### Quick-add syntax

`Essay draft #engl fri 5pm !high ~2h`

| Token | Meaning |
| --- | --- |
| `#engl` | class (matches code or name, prefix is fine) |
| `today`, `tomorrow`, `fri`, `next mon`, `11/24` | due date (defaults to today) |
| `5pm`, `17:30`, `at 9am` | due time |
| `!high` / `!h`, `!med`, `!low` | priority |
| `~90m`, `~2h` | time estimate |

The type is inferred from words like *quiz*, *exam*, *essay*, *reading*, *project*.

### Keyboard

`N` new assignment · `/` search · `G` then `D`/`A`/`W`/`C`/`K`/`S` to switch pages · `⌘/Ctrl+Enter` save · `⇧⌘/Ctrl+Enter` save and add another · `Esc` close.

## Architecture

```
src/
  types.ts               Data model (Course, Assignment, Settings, StudyPlan, AppData)
  lib/
    storage.ts           PersistenceAdapter interface + LocalStorageAdapter, validation/normalization, import/export
    sampleData.ts        Demo semester generated relative to today
    planning.ts          Overdue/urgency logic, due-date buckets, study ranking algorithm
    quickAdd.ts          Natural-language quick-add parser
    date.ts              Local-date helpers (dates stored as YYYY-MM-DD, never shifted by time zones)
    router.ts            Tiny hash router
    hooks.ts             useNow (live clock), useAssignmentActions (mutations with toasts + undo)
  store/
    AppStore.tsx         useReducer store + typed actions, debounced auto-save, cross-tab sync
    UIContext.tsx        Editor modal, toasts, confirm dialogs
  components/            AssignmentRow, AssignmentEditor, QuickAdd, Menu, Modal, Checkbox, Navigation, ui primitives
  pages/                 Dashboard, Assignments, WeeklyPlanner, CalendarPage, Classes (+ detail), StudyPlanner, Settings
  styles/                Design tokens (light/dark), components, page layouts — plain CSS, no framework
```

The only runtime dependencies are **React** and **lucide-react** (icons).

### Adding a backend later

All persistence goes through the `PersistenceAdapter` interface in `src/lib/storage.ts`:

```ts
interface PersistenceAdapter {
  load(): AppData | null;
  save(data: AppData): void;
  clear(): void;
  subscribe?(onChange: (data: AppData) => void): () => void;
}
```

To move to a server, write an `ApiAdapter` (for example, one that loads after sign-in, saves through a REST or Supabase client, and uses `subscribe` for realtime updates) and pass it to `<AppStoreProvider adapter={...}>`. Every mutation already goes through the typed actions in `AppStore.tsx`, so you can also switch to per-entity API calls there without touching any UI code. IDs are client-generated strings, and every record carries `createdAt`/`updatedAt`, ready for syncing.
