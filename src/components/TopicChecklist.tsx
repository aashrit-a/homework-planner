import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { StudyTopic } from '../types';
import { uid } from '../lib/id';
import { Checkbox } from './Checkbox';

interface Props {
  topics: StudyTopic[];
  onChange: (topics: StudyTopic[]) => void;
  /** Hide the add field and remove buttons (toggle only). */
  readOnly?: boolean;
  placeholder?: string;
  inputId?: string;
}

/** Checklist of things to study for a test. Enter adds a topic; each one can be ticked off or removed. */
export function TopicChecklist({ topics, onChange, readOnly, placeholder = 'Add a topic, chapter or problem set', inputId }: Props) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...topics, { id: uid('t_'), text: text.slice(0, 200), done: false }]);
    setDraft('');
  };

  return (
    <div className="topics">
      {topics.length > 0 && (
        <ul className="topic-list">
          {topics.map((t) => (
            <li key={t.id} className={`topic${t.done ? ' done' : ''}`}>
              <Checkbox
                size="sm"
                priority="low"
                checked={t.done}
                label={`${t.done ? 'Unmark' : 'Mark'} “${t.text}” as studied`}
                onChange={() => onChange(topics.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
              />
              <span className="topic-text">{t.text}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="icon-btn icon-btn-sm topic-remove"
                  aria-label={`Remove “${t.text}”`}
                  onClick={() => onChange(topics.filter((x) => x.id !== t.id))}
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="topic-add">
          <Plus size={14} className="topic-add-icon" />
          <input
            id={inputId}
            className="topic-input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                add();
              }
            }}
            onBlur={add}
            aria-label="Add study topic"
            maxLength={200}
          />
        </div>
      )}
    </div>
  );
}
