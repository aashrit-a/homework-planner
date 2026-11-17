import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Clock, GraduationCap, MapPin, Pencil, Plus } from 'lucide-react';
import type { Assignment, Course } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useAssignmentActions, useNow } from '../lib/hooks';
import { formatLongDate, formatMinutes, formatTime, fromKey, monthShort, toKey, weekdayShort } from '../lib/date';
import { countdown, pastTests, prepProgress, upcomingTests } from '../lib/tests';
import { NO_CLASS_COLOR, TYPE_LABEL } from '../lib/constants';
import { AssignmentRow } from '../components/AssignmentRow';
import { QuickAdd } from '../components/QuickAdd';
import { TopicChecklist } from '../components/TopicChecklist';
import { ClassTag, EmptyState, PageHeader, ProgressRing, Segmented } from '../components/ui';

type Tab = 'upcoming' | 'past';

export function Tests() {
  const { data } = useStore();
  const { getCourse } = useCourses();
  const { openEditor } = useUI();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('upcoming');

  const upcoming = useMemo(() => upcomingTests(data.assignments, now), [data.assignments, now]);
  const past = useMemo(() => pastTests(data.assignments, now), [data.assignments, now]);
  const [next, ...rest] = upcoming;

  const addTest = () => openEditor({ defaults: { type: 'test', priority: 'high' } });
  const thisWeek = upcoming.filter((a) => countdown(a, now).tone !== 'neutral').length;

  return (
    <div className="page">
      <PageHeader
        title="Upcoming Tests"
        subtitle={
          upcoming.length
            ? `${upcoming.length} upcoming · ${thisWeek ? `${thisWeek} in the next 7 days` : 'none in the next 7 days'}`
            : 'Track exams and quizzes, and what to study for each.'
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={addTest}>
            <Plus size={16} /> Add test
          </button>
        }
      />

      <QuickAdd defaultType="test" defaultPriority="high" placeholder="Add a test — e.g. “Biology midterm next Friday at 9am”" />

      <div className="toolbar">
        <Segmented<Tab>
          size="sm"
          ariaLabel="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: `Upcoming (${upcoming.length})` },
            { value: 'past', label: `Past (${past.length})` },
          ]}
        />
      </div>

      {tab === 'upcoming' ? (
        upcoming.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<GraduationCap size={22} />}
              title="No upcoming tests"
              description="Add exams and quizzes as soon as they’re announced. You’ll get a countdown and a checklist of what to study."
              action={
                <button type="button" className="btn btn-primary" onClick={addTest}>
                  <Plus size={16} /> Add your first test
                </button>
              }
            />
          </div>
        ) : (
          <>
            <NextTest a={next} course={getCourse(next.courseId)} now={now} />
            {rest.length > 0 && (
              <section className="test-later">
                <h2 className="section-label">Later</h2>
                <div className="test-grid">
                  {rest.map((a) => (
                    <TestCard key={a.id} a={a} course={getCourse(a.courseId)} now={now} />
                  ))}
                </div>
              </section>
            )}
          </>
        )
      ) : past.length === 0 ? (
        <div className="card">
          <EmptyState compact title="No past tests yet" description="Tests move here once you mark them taken or their date passes." />
        </div>
      ) : (
        <div className="card list-card">
          {past.map((a) => (
            <AssignmentRow key={a.id} assignment={a} course={getCourse(a.courseId)} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function when(a: Assignment): string {
  const d = fromKey(a.dueDate);
  return `${weekdayShort(d)}, ${monthShort(d)} ${d.getDate()}${a.dueTime ? ` · ${formatTime(a.dueTime)}` : ''}`;
}

function NextTest({ a, course, now }: { a: Assignment; course: Course | null; now: Date }) {
  const { data, actions } = useStore();
  const { openEditor, toast } = useUI();
  const { toggleComplete } = useAssignmentActions();
  const cd = countdown(a, now);
  const prep = prepProgress(a);
  const today = toKey(now);
  const inTodaysPlan = (data.studyPlan[today] ?? []).includes(a.id);

  return (
    <section className="card next-test" style={{ '--c': course?.color ?? NO_CLASS_COLOR } as React.CSSProperties} aria-label="Next test">
      <div className="next-test-main">
        <div className={`countdown countdown-${cd.tone}`}>
          <span className="countdown-value">{cd.value}</span>
          <span className="countdown-unit">{cd.unit}</span>
        </div>
        <div className="next-test-info">
          <div className="eyebrow">Next {TYPE_LABEL[a.type].toLowerCase()}</div>
          <h2 className="next-test-title">{a.title}</h2>
          <div className="test-meta">
            <ClassTag course={course} />
            <span>{formatLongDate(fromKey(a.dueDate))}{a.dueTime ? `, ${formatTime(a.dueTime)}` : ''}</span>
            {a.location && (
              <span className="test-meta-item">
                <MapPin size={13} /> {a.location}
              </span>
            )}
            {a.estimatedMinutes ? (
              <span className="test-meta-item">
                <Clock size={13} /> {formatMinutes(a.estimatedMinutes)} of study
              </span>
            ) : null}
          </div>
        </div>
        <div className="next-test-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={inTodaysPlan}
            onClick={() => {
              actions.setPlan(today, [...(data.studyPlan[today] ?? []), a.id]);
              toast('Added to today’s study plan', { tone: 'success' });
            }}
          >
            {inTodaysPlan ? <Check size={14} /> : <CalendarPlus size={14} />} {inTodaysPlan ? 'In today’s plan' : 'Study today'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEditor({ assignment: a })}>
            <Pencil size={14} /> Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleComplete(a.id)}>
            <Check size={14} /> Mark taken
          </button>
        </div>
      </div>

      <div className="next-test-prep">
        <div className="prep-head">
          <ProgressRing value={prep.pct} size={44} stroke={5}>
            <span className="ring-pct small">
              {!prep.total ? '—' : prep.done === prep.total ? <Check size={16} strokeWidth={3} className="text-success" /> : `${Math.round(prep.pct * 100)}%`}
            </span>
          </ProgressRing>
          <div>
            <div className="prep-title">Study checklist</div>
            <div className="muted small">
              {prep.total ? `${prep.done} of ${prep.total} topics reviewed` : 'List the chapters, topics or practice sets to review.'}
            </div>
          </div>
        </div>
        <TopicChecklist inputId="next-test-topic" topics={a.topics} onChange={(topics) => actions.updateAssignment(a.id, { topics })} />
        {a.notes && <p className="next-test-notes">{a.notes}</p>}
      </div>
    </section>
  );
}

function TestCard({ a, course, now }: { a: Assignment; course: Course | null; now: Date }) {
  const { openEditor } = useUI();
  const cd = countdown(a, now);
  const prep = prepProgress(a);
  return (
    <button type="button" className="test-card" style={{ '--c': course?.color ?? NO_CLASS_COLOR } as React.CSSProperties} onClick={() => openEditor({ assignment: a })}>
      <div className="test-card-top">
        <ClassTag course={course} size="sm" />
        <span className={`countdown-pill countdown-${cd.tone}`}>{cd.label}</span>
      </div>
      <div className="test-card-title">{a.title}</div>
      <div className="test-card-meta">
        <span>{when(a)}</span>
        {a.location && (
          <span className="test-meta-item">
            <MapPin size={12} /> {a.location}
          </span>
        )}
      </div>
      <div className="test-card-prep">
        <div className="bar bar-sm">
          <div className="bar-fill" style={{ width: `${prep.pct * 100}%`, background: 'var(--c)' }} />
        </div>
        <span className="muted small tabular">{prep.total ? `${prep.done}/${prep.total} topics` : 'No study list yet'}</span>
      </div>
    </button>
  );
}
