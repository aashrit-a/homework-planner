import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Assignment } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useMediaQuery, useNow } from '../lib/hooks';
import { addDays, addMonths, formatLongDate, fromKey, formatRange, formatTime, monthLong, startOfMonth, startOfWeek, toKey, weekDays, weekdayShort } from '../lib/date';
import { compareByDue, isDone, isOverdue } from '../lib/planning';
import { NO_CLASS_COLOR } from '../lib/constants';
import { AssignmentRow } from '../components/AssignmentRow';
import { EmptyState, PageHeader, Segmented } from '../components/ui';

type Mode = 'month' | 'week';
const HOUR_START = 7;
const HOUR_END = 24;
const HOUR_PX = 44;
const MODE_KEY = 'margin:calendarMode';

export function CalendarPage() {
  const { data } = useStore();
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const now = useNow();
  const today = toKey(now);
  const isMobile = useMediaQuery('(max-width: 720px)');

  const [mode, setModeState] = useState<Mode>(() => {
    try {
      return (localStorage.getItem(MODE_KEY) as Mode) || 'month';
    } catch {
      return 'month';
    }
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of data.assignments) m.set(a.dueDate, [...(m.get(a.dueDate) ?? []), a]);
    for (const list of m.values()) list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareByDue(a, b));
    return m;
  }, [data.assignments]);

  const move = (n: number) => {
    if (mode === 'month') setCursor((c) => addMonths(c, n));
    else setCursor((c) => addDays(c, n * 7));
  };
  const goToday = () => {
    setCursor(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    setSelected(today);
  };

  const title =
    mode === 'month'
      ? `${monthLong(cursor)} ${cursor.getFullYear()}`
      : formatRange(startOfWeek(cursor), addDays(startOfWeek(cursor), 6));

  const selectedList = byDay.get(selected) ?? [];

  return (
    <div className="page page-wide">
      <PageHeader
        title="Calendar"
        subtitle={title}
        actions={
          <>
            <Segmented<Mode> size="sm" ariaLabel="Calendar view" value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
            <div className="nav-group">
              <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label={`Previous ${mode}`}>
                <ChevronLeft size={17} />
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
                Today
              </button>
              <button type="button" className="icon-btn" onClick={() => move(1)} aria-label={`Next ${mode}`}>
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        }
      />

      <div className="cal-layout">
        <div className="card cal-card">
          {mode === 'month' ? (
            <MonthGrid cursor={cursor} byDay={byDay} today={today} selected={selected} onSelect={setSelected} compact={isMobile} now={now} />
          ) : (
            <WeekGrid cursor={cursor} byDay={byDay} today={today} selected={selected} onSelect={setSelected} now={now} />
          )}
        </div>

        <aside className="card cal-side">
          <div className="card-header">
            <h2 className="card-title">
              {formatLongDate(fromKey(selected))}
              {selected === today && <span className="pill pill-accent">Today</span>}
            </h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditor({ defaults: { dueDate: selected } })}>
              <Plus size={14} /> Add
            </button>
          </div>
          {selectedList.length === 0 ? (
            <EmptyState compact title="Nothing due" description="Click “Add” to schedule an assignment for this day." />
          ) : (
            selectedList.map((a) => <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} showDate={false} timeOnly />)
          )}
        </aside>
      </div>
    </div>
  );
}

interface GridProps {
  cursor: Date;
  byDay: Map<string, Assignment[]>;
  today: string;
  selected: string;
  onSelect: (key: string) => void;
  now: Date;
}

function Chip({ a, now }: { a: Assignment; now: Date }) {
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const c = getCourse(a.courseId);
  return (
    <button
      type="button"
      className={`cal-chip${isDone(a) ? ' done' : ''}${isOverdue(a, now) ? ' overdue' : ''}`}
      style={{ '--c': c?.color ?? NO_CLASS_COLOR } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        openEditor({ assignment: a });
      }}
      title={`${a.title}${c ? ` · ${c.name}` : ''}${a.dueTime ? ` · ${formatTime(a.dueTime)}` : ''}`}
    >
      {a.dueTime && <span className="cal-chip-time">{formatTime(a.dueTime).replace(' ', '').toLowerCase()}</span>}
      <span className="cal-chip-title">{a.title}</span>
    </button>
  );
}

function MonthGrid({ cursor, byDay, today, selected, onSelect, compact, now }: GridProps & { compact: boolean }) {
  const { openEditor } = useUI();
  const { getCourse } = useCourses();
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Drop a trailing week that is entirely in the next month.
  const visible = cells[35].getMonth() !== first.getMonth() ? cells.slice(0, 35) : cells;
  const MAX = 3;

  return (
    <div className="month">
      <div className="month-head">
        {weekDays(gridStart).map((d) => (
          <div key={d.getDay()} className="month-head-cell">
            {compact ? weekdayShort(d).slice(0, 1) : weekdayShort(d)}
          </div>
        ))}
      </div>
      <div className="month-grid" style={{ gridTemplateRows: `repeat(${visible.length / 7}, minmax(0, 1fr))` }}>
        {visible.map((d) => {
          const key = toKey(d);
          const list = byDay.get(key) ?? [];
          const outside = d.getMonth() !== first.getMonth();
          return (
            <div
              key={key}
              className={`month-cell${outside ? ' outside' : ''}${key === today ? ' today' : ''}${key === selected ? ' selected' : ''}`}
              onClick={() => onSelect(key)}
              onDoubleClick={() => openEditor({ defaults: { dueDate: key } })}
              role="button"
              tabIndex={0}
              aria-label={`${formatLongDate(d)}, ${list.length} assignments`}
              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect(key)}
            >
              <div className="month-cell-head">
                <span className="month-num">{d.getDate()}</span>
                {!compact && (
                  <button
                    type="button"
                    className="month-add"
                    aria-label={`Add assignment on ${formatLongDate(d)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor({ defaults: { dueDate: key } });
                    }}
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
              {compact ? (
                <div className="month-dots">
                  {list.slice(0, 4).map((a) => (
                    <span key={a.id} className={`dot${isDone(a) ? ' done' : ''}`} style={{ background: getCourse(a.courseId)?.color ?? NO_CLASS_COLOR }} />
                  ))}
                </div>
              ) : (
                <div className="month-items">
                  {list.slice(0, list.length > MAX ? MAX - 1 : MAX).map((a) => (
                    <Chip key={a.id} a={a} now={now} />
                  ))}
                  {list.length > MAX && <span className="month-more">+{list.length - (MAX - 1)} more</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Placed {
  a: Assignment;
  top: number;
  lane: number;
  lanes: number;
}

function layoutDay(list: Assignment[]): Placed[] {
  const timed = list.filter((a) => a.dueTime).sort(compareByDue);
  const blockMin = 50; // visual block size in minutes
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => (p.lanes = lanes));
    cluster = [];
  };
  for (const a of timed) {
    const [h, m] = a.dueTime!.split(':').map(Number);
    const mins = Math.max(0, h * 60 + m - HOUR_START * 60);
    if (mins >= clusterEnd) flush();
    const used = new Set(cluster.filter((p) => p.top + blockMin > mins).map((p) => p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p = { a, top: mins, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, mins + blockMin);
  }
  flush();
  return placed;
}

function WeekGrid({ cursor, byDay, today, selected, onSelect, now }: GridProps) {
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const days = weekDays(startOfWeek(cursor));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowMinutes = now.getHours() * 60 + now.getMinutes() - HOUR_START * 60;

  useEffect(() => {
    // Start scrolled to mid-afternoon where most deadlines cluster.
    if (scrollRef.current) scrollRef.current.scrollTop = (12 - HOUR_START) * HOUR_PX;
  }, []);

  return (
    <div className="weekgrid">
      <div className="wg-head">
        <div className="wg-gutter" />
        {days.map((d) => {
          const key = toKey(d);
          return (
            <button type="button" key={key} className={`wg-day-head${key === today ? ' today' : ''}${key === selected ? ' selected' : ''}`} onClick={() => onSelect(key)}>
              <span className="wg-weekday">{weekdayShort(d)}</span>
              <span className="wg-date">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="wg-allday">
        <div className="wg-gutter wg-gutter-label">All day</div>
        {days.map((d) => {
          const key = toKey(d);
          const untimed = (byDay.get(key) ?? []).filter((a) => !a.dueTime);
          return (
            <div key={key} className={`wg-allday-cell${key === today ? ' today' : ''}`} onClick={() => onSelect(key)}>
              {untimed.map((a) => (
                <Chip key={a.id} a={a} now={now} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="wg-scroll" ref={scrollRef}>
        <div className="wg-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="wg-gutter wg-hours">
            {hours.map((h) => (
              <div key={h} className="wg-hour-label" style={{ top: (h - HOUR_START) * HOUR_PX }}>
                {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const key = toKey(d);
            const placed = layoutDay(byDay.get(key) ?? []);
            return (
              <div
                key={key}
                className={`wg-col${key === today ? ' today' : ''}`}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mins = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30 + HOUR_START * 60;
                  const h = Math.min(23, Math.floor(mins / 60));
                  openEditor({ defaults: { dueDate: key, dueTime: `${String(h).padStart(2, '0')}:${mins % 60 === 0 ? '00' : '30'}` } });
                }}
                onClick={() => onSelect(key)}
                title="Double-click to add at this time"
              >
                {hours.map((h) => (
                  <div key={h} className="wg-line" style={{ top: (h - HOUR_START) * HOUR_PX }} />
                ))}
                {key === today && nowMinutes >= 0 && <div className="wg-now" style={{ top: (nowMinutes / 60) * HOUR_PX }} />}
                {placed.map(({ a, top, lane, lanes }) => {
                  const c = getCourse(a.courseId);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className={`wg-event${isDone(a) ? ' done' : ''}${isOverdue(a, now) ? ' overdue' : ''}`}
                      style={{
                        top: (top / 60) * HOUR_PX,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        '--c': c?.color ?? NO_CLASS_COLOR,
                      } as React.CSSProperties}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor({ assignment: a });
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <span className="wg-event-time">{formatTime(a.dueTime)}</span>
                      <span className="wg-event-title">{a.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
