# Margin — Homework Tracker & Academic Planner

A fast, minimal planner for college coursework: assignments, tests, a weekly planner, a calendar, classes and a study planner. Data is saved in the browser first, and syncs between devices when you sign in.

## Run it

```bash
npm install
npm run dev        # app only, http://localhost:5173 (sign-in shows "can't reach the server")
npm run dev:full   # app + API with a local database, http://localhost:8787
npm run build      # type-checks the app and the Worker, builds dist/
```

## Deploy (Cloudflare)

The site is a Cloudflare Worker (`wrangler.jsonc`) that serves the built app from `dist/` and runs the API in `worker/index.ts` for `/api/*`. With the project connected to this repository in Cloudflare (Workers Builds: build command `npm run build`, deploy command `npx wrangler deploy`), every push to `main` deploys.

The D1 database that stores accounts is declared without an id, so wrangler creates it (named `homework-planner`) on the first deploy and reuses it afterwards. Its tables are created automatically on the first API request. To pin it explicitly, copy the database id from the Cloudflare dashboard into `wrangler.jsonc` as `database_id`.

`.github/workflows/deploy-pages.yml` can also publish `dist/` to GitHub Pages; a static host has no API, so sign-in there says accounts aren't available.

`npm run build:artifact` produces a single-file copy (`dist-artifact/margin.html`) for hosting without a server; accounts are hidden there.

## Features

- **Dashboard**: greeting, a one-line summary of the workload, a "Get started" checklist for new users, the next few tests with a countdown, four stat cards (each links to a filtered list), today's tasks with overdue items first, upcoming deadlines for the next 7 days, a weekly progress ring and a workload-per-day chart.
- **Upcoming Tests**: every test and quiz with a countdown, location and a study checklist of topics to tick off as you review. The next test gets a featured card with a "Study today" button that adds it to today's study plan. Past tests are kept in their own tab.
- **Assignments**: quick-add bar, a full editor with "Save & add another", search, filters (class, status, priority, type), sorting (due, priority, class, recently added), grouping by due date, changing priority and status from the row, and delete with undo.
- **Weekly Planner**: Monday–Sunday board with week navigation and today highlighted. Each day shows its count, and a workload chart flags the busiest day. Drag a card to another day to reschedule it. Click a day for details, or add straight to a day.
- **Calendar**: month and week views (the week view is a time grid with a "now" line). Assignments are color-coded by class. Click an assignment to edit it, click a day to see its list, use `+` (or double-click) to add on that date.
- **Classes**: add, edit and delete classes with a name, short code, teacher and color (12 presets plus a custom picker). Each class has its own page listing its assignments.
- **Study Planner**: a suggested order ranked by deadline, priority, type and effort. Build a daily plan by hand (drag, ↑/↓, remove) or use Auto-fill up to your daily goal.
- **Accounts and sync**: sign in or create an account (`#signin`) to use the same planner on several devices. See below.
- **Settings**: name, light/dark/system theme, daily study goal, JSON export and import (validated), clear all.

The planner starts empty. Older versions created a demo semester on first launch; the first time an existing browser loads this version, those demo classes and assignments are removed once (anything you added yourself is kept).

### Quick add

Type the way you'd say it:

- `Essay draft due Friday at 5pm, high priority`
- `math homework due thursday, takes 2 hours`
- `"Lab report" for organic chemistry next tuesday`
- `biology midterm in 2 weeks at 9am`

What it understands:

| | Examples |
| --- | --- |
| Date | `today`, `tonight`, `tomorrow`, `friday`, `this friday`, `next friday` (the Friday of next week), `in 3 days`, `in 2 weeks`, `next week`, `end of the week`, `dec 3`, `december 3rd`, `11/24`, `the 25th` |
| Time | `at 5pm`, `11:50 pm`, `17:30`, `at 5` (afternoon), `noon`, `midnight`, `morning`, `evening` |
| Priority | `high priority`, `low priority`, `priority: high`, `urgent`, `important` |
| Effort | `takes 2 hours`, `about 45 minutes`, `half an hour` |
| Class | class names and codes anywhere in the sentence (`math homework`, `for linear algebra`, `chem lab`) |

Common misspellings such as "tomrorow" or "wendesday" are corrected. Put the title in quotes to keep it exactly as typed. With no date, it's due today; a time that has already passed today means tomorrow. The type (test, quiz, essay, reading, project) comes from words in the title. The older shorthand (`#class`, `!high`, `~2h`) still works.

### Keyboard

`N` new assignment · `/` search · `G` then `D`/`A`/`T`/`W`/`C`/`K`/`S` to switch pages · `⌘/Ctrl+Enter` save · `⇧⌘/Ctrl+Enter` save and add another · `Esc` close.

## Architecture

```
src/
  types.ts               Data model (Course, Assignment, Settings, StudyPlan, AppData)
  lib/
    storage.ts           PersistenceAdapter interface + LocalStorageAdapter, validation/normalization, import/export
    merge.ts             Merging two copies of the planner (sync), fingerprints
    api.ts               Client for the Worker API
    tests.ts             Upcoming/past tests, countdowns and study-checklist progress
    planning.ts          Overdue/urgency logic, due-date buckets, study ranking algorithm
    quickAdd.ts          Natural-language quick-add parser
    date.ts              Local-date helpers (dates stored as YYYY-MM-DD, never shifted by time zones)
    router.ts            Tiny hash router
    hooks.ts             useNow (live clock), useAssignmentActions (mutations with toasts + undo)
  store/
    AppStore.tsx         useReducer store + typed actions, debounced auto-save, cross-tab sync
    UIContext.tsx        Editor modal, toasts, confirm dialogs
    AccountContext.tsx   Sign-in state and the sync engine
  components/            AssignmentRow, AssignmentEditor, QuickAdd, Menu, Modal, Checkbox, Navigation, ui primitives
  pages/                 Dashboard, Assignments, WeeklyPlanner, CalendarPage, Classes (+ detail), StudyPlanner, Settings
  styles/                Design tokens (light/dark), components, page layouts — plain CSS, no framework
worker/
  index.ts               Cloudflare Worker: accounts, sessions and planner storage (D1)
```

The only runtime dependencies are **React** and **lucide-react** (icons).

## Accounts and sync

**Your data is never replaced, only merged.**

- The planner always lives on the device first and works offline. Signing in adds a copy in your account.
- The first time a device signs in, what's on it is saved as a backup (Settings → Account → *Backup from before you signed in*, with *Restore missing*), then merged with the account. Nothing on either side is dropped.
- After that, edits upload about 2 seconds after you make them. Changes from other devices arrive when you return to the tab, when you come back online, every minute while the tab is open, or with *Sync now*.
- If two devices changed things at the same time, the server notices (revision check) and the copies are merged:
  - the newer edit of each item wins;
  - deletions are remembered (for 180 days) so they don't come back;
  - settings and the study plan come from whichever device changed them last.
- Signing out keeps the planner on the device unless you tick *Also remove the planner from this device*.

**Security**

- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, per-user salt).
- Sessions are random tokens in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie that lasts 60 days; only a SHA-256 hash of each token is stored.
- Writes must come from the same site, as JSON.
- After 10 wrong passwords, an account is locked for 15 minutes.

**Limitations**

- There's no password reset (there's no email service), so keep an exported backup.
- Sync is whole-planner (one JSON document per account, up to about 1.5 MB, which is thousands of assignments).

### API

| | |
| --- | --- |
| `POST /api/signup` `{ email, password }` | create account, start session |
| `POST /api/login` `{ email, password }` | start session |
| `POST /api/logout` | end session |
| `GET /api/session` | `{ email }` or 401 |
| `GET /api/data` | `{ revision, data }` |
| `PUT /api/data` `{ data, baseRevision }` | save; 409 with the current copy if another device saved first |
