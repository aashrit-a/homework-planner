import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, GripVertical, ListPlus, Sparkles, Target, X, Check, Clock } from 'lucide-react';
import type { Assignment } from '../types';
import { useCourses, useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { useAssignmentActions, useNow } from '../lib/hooks';
import { addDaysKey, formatDue, formatMinutes, fromKey, relativeDay, toKey, monthShort } from '../lib/date';
import { isDone, isOverdue, rankForStudy, sumMinutes } from '../lib/planning';
import { TYPE_LABEL } from '../lib/constants';
import { Checkbox } from '../components/Checkbox';
import { ClassTag, EmptyState, PageHeader, PriorityFlag, ProgressRing } from '../components/ui';

export function StudyPlanner() {
  const { data, actions } = useStore();
  const { getCourse } = useCourses();
  const { openEditor, toast } = useUI();
  const { toggleComplete } = useAssignmentActions();
  const now = useNow();
  const today = toKey(now);
  const [day, setDay] = useState(today);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const ranked = useMemo(() => rankForStudy(data.assignments, now), [data.assignments, now]);
  const byId = useMemo(() => new Map(data.assignments.map((a) => [a.id, a])), [data.assignments]);
  const planIds = data.studyPlan[day] ?? [];
  const plan = planIds.map((id) => byId.get(id)).filter(Boolean) as Assignment[];
  const planSet = new Set(planIds);
  const goal = data.settings.dailyStudyGoalMinutes;
  const plannedMinutes = sumMinutes(plan);
  const planDone = plan.filter(isDone);
  const plannedDoneMinutes = sumMinutes(planDone);

  const remainingMinutes = sumMinutes(ranked.map((r) => r.assignment));
  const overdueCount = ranked.filter((r) => isOverdue(r.assignment, now)).length;
  const next3Days = ranked.filter((r) => r.assignment.dueDate <= addDaysKey(today, 3)).map((r) => r.assignment);

  const setPlan = (ids: string[]) => actions.setPlan(day, ids);
  const addToPlan = (id: string) => !planSet.has(id) && setPlan([...planIds, id]);
  const removeFromPlan = (id: string) => setPlan(planIds.filter((x) => x !== id));
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= planIds.length || from === to) return;
    const next = [...planIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPlan(next);
  };

  const autoFill = () => {
    const ids = [...planIds];
    let total = sumMinutes(plan.filter((a) => !isDone(a)));
    let added = 0;
    for (const { assignment: a } of ranked) {
      if (ids.includes(a.id)) continue;
      const est = a.estimatedMinutes ?? 60;
      if (total + est > goal && total > 0) continue;
      ids.push(a.id);
      total += est;
      added++;
      if (total >= goal) break;
    }
    if (!added) {
      toast(ranked.length ? 'Your plan already fills today’s goal' : 'Nothing left to plan');
      return;
    }
    setPlan(ids);
    toast(`Added ${added} task${added === 1 ? '' : 's'} · ${formatMinutes(total)} planned`, { tone: 'success' });
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/x-assignment');
    setDropIndex(null);
    setDragId(null);
    if (!id) return;
    const from = planIds.indexOf(id);
    if (from === -1) {
      const next = [...planIds];
      next.splice(index, 0, id);
      setPlan(next);
    } else {
      moveItem(from, from < index ? index - 1 : index);
    }
  };

  const dayDate = fromKey(day);
  const dayLabel = relativeDay(day, today);

  return (
    <div className="page page-wide">
      <PageHeader title="Study Planner" subtitle="Decide what to work on next, then build a plan for the day." />

      <div className="study-stats">
        <div className="mini-stat">
          <span className="mini-stat-num">{ranked.length}</span>
          <span className="muted small">assignments left</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-num">{formatMinutes(remainingMinutes) === '—' ? '0h' : formatMinutes(remainingMinutes)}</span>
          <span className="muted small">estimated work</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-num">{formatMinutes(sumMinutes(next3Days)) === '—' ? '0h' : formatMinutes(sumMinutes(next3Days))}</span>
          <span className="muted small">due in next 3 days</span>
        </div>
        <div className={`mini-stat${overdueCount ? ' mini-stat-danger' : ''}`}>
          <span className="mini-stat-num">{overdueCount}</span>
          <span className="muted small">overdue</span>
        </div>
      </div>

      <div className="study-grid">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Sparkles size={15} className="text-accent" /> Suggested order
            </h2>
            <span className="muted small hide-mobile">Ranked by deadline, priority & effort</span>
          </div>
          {ranked.length === 0 ? (
            <EmptyState compact icon={<Target size={20} />} title="Nothing left to do" description="Every assignment is complete. Nice work." />
          ) : (
            <ol className="ranked">
              {ranked.map(({ assignment: a, reason, tone }, i) => {
                const inPlan = planSet.has(a.id);
                return (
                  <li
                    key={a.id}
                    className={`ranked-item${inPlan ? ' in-plan' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/x-assignment', a.id);
                      e.dataTransfer.effectAllowed = 'copyMove';
                      setDragId(a.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
                    <span className="rank">{i + 1}</span>
                    <div className="ranked-main" onClick={() => openEditor({ assignment: a })} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openEditor({ assignment: a })}>
                      <div className="row-title">
                        <span className="row-title-text">{a.title}</span>
                      </div>
                      <div className="row-meta">
                        <ClassTag course={getCourse(a.courseId)} size="sm" />
                        <span className={`reason reason-${tone}`}>{reason}</span>
                        <span className="row-meta-item">
                          <Clock size={12} /> {a.estimatedMinutes ? formatMinutes(a.estimatedMinutes) : 'no estimate'}
                        </span>
                        <span className="row-meta-item hide-mobile">{TYPE_LABEL[a.type]}</span>
                      </div>
                    </div>
                    <PriorityFlag priority={a.priority} />
                    <button
                      type="button"
                      className={`btn btn-sm ${inPlan ? 'btn-ghost' : 'btn-secondary'}`}
                      onClick={() => (inPlan ? removeFromPlan(a.id) : addToPlan(a.id))}
                      aria-label={inPlan ? `Remove “${a.title}” from plan` : `Add “${a.title}” to plan`}
                    >
                      {inPlan ? <Check size={14} /> : <ListPlus size={14} />}
                      <span className="hide-mobile">{inPlan ? 'Planned' : 'Plan'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="card plan-card">
          <div className="card-header">
            <div className="plan-day-nav">
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setDay(addDaysKey(day, -1))} aria-label="Previous day">
                <ChevronLeft size={16} />
              </button>
              <h2 className="card-title">
                {dayLabel}
                <span className="muted small"> · {monthShort(dayDate)} {dayDate.getDate()}</span>
              </h2>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setDay(addDaysKey(day, 1))} aria-label="Next day">
                <ChevronRight size={16} />
              </button>
              {day !== today && (
                <button type="button" className="link-btn" onClick={() => setDay(today)}>
                  Today
                </button>
              )}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={autoFill} disabled={ranked.length === 0}>
              <Sparkles size={14} /> Auto-fill
            </button>
          </div>

          <div className="plan-goal">
            <ProgressRing value={plannedMinutes ? plannedDoneMinutes / plannedMinutes : 0} size={52} stroke={5}>
              <span className="ring-pct small">
                {planDone.length}/{plan.length}
              </span>
            </ProgressRing>
            <div className="plan-goal-text">
              <div>
                <strong>{formatMinutes(plannedMinutes) === '—' ? '0m' : formatMinutes(plannedMinutes)}</strong> planned <span className="muted">of {formatMinutes(goal)} goal</span>
              </div>
              <div className="bar bar-sm">
                <div className={`bar-fill${plannedMinutes > goal ? ' over' : ''}`} style={{ width: `${Math.min(100, (plannedMinutes / goal) * 100)}%` }} />
              </div>
              {plannedMinutes > goal && <div className="small text-warning">{formatMinutes(plannedMinutes - goal)} over your daily goal</div>}
            </div>
          </div>

          <ol
            className={`plan-list${dragId && !planSet.has(dragId) ? ' accepting' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (dropIndex === null) setDropIndex(plan.length);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropIndex(null)}
            onDrop={(e) => onDrop(e, dropIndex ?? plan.length)}
          >
            {plan.length === 0 && (
              <li className="plan-empty">
                <ListPlus size={18} />
                <span>Drag tasks here, press “Plan”, or use Auto-fill to build {day === today ? 'today’s' : 'this day’s'} study session.</span>
              </li>
            )}
            {plan.map((a, i) => (
              <li
                key={a.id}
                className={`plan-item${isDone(a) ? ' done' : ''}${dropIndex === i ? ' drop-before' : ''}${dragId === a.id ? ' dragging' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/x-assignment', a.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(a.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropIndex(e.clientY < rect.top + rect.height / 2 ? i : i + 1);
                }}
              >
                <GripVertical size={14} className="grip" />
                <Checkbox size="sm" checked={isDone(a)} onChange={() => toggleComplete(a.id)} priority={a.priority} label={`Mark “${a.title}” complete`} />
                <div className="plan-main" onClick={() => openEditor({ assignment: a })}>
                  <span className="row-title-text">{a.title}</span>
                  <span className="row-meta">
                    <ClassTag course={getCourse(a.courseId)} size="sm" />
                    <span className="row-meta-item">{formatMinutes(a.estimatedMinutes)}</span>
                    <span className={`row-meta-item${isOverdue(a, now) ? ' text-danger' : ''}`}>due {formatDue(a.dueDate, a.dueTime).toLowerCase()}</span>
                  </span>
                </div>
                <div className="plan-actions">
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => moveItem(i, i - 1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => moveItem(i, i + 1)} disabled={i === plan.length - 1} aria-label="Move down">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => removeFromPlan(a.id)} aria-label="Remove from plan">
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
            {dropIndex === plan.length && plan.length > 0 && <li className="drop-end" aria-hidden="true" />}
          </ol>
          {plan.length > 0 && (
            <div className="plan-footer">
              <span className="muted small">
                {planDone.length === plan.length ? 'Plan complete — great session.' : `${plan.length - planDone.length} left · ${formatMinutes(plannedMinutes - plannedDoneMinutes)} to go`}
              </span>
              <button type="button" className="link-btn" onClick={() => setPlan([])}>
                Clear plan
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
