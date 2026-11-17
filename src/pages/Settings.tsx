import { useRef, useState } from 'react';
import { Copy, Download, Monitor, Moon, RotateCcw, Sun, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useUI } from '../store/UIContext';
import { exportData, parseBackupText, readImportFile, serializeBackup } from '../lib/storage';
import { Modal } from '../components/Modal';
import type { AppData } from '../types';
import { createEmptyData, createSampleData } from '../lib/sampleData';
import { PageHeader, Segmented, Kbd } from '../components/ui';
import type { ThemePreference } from '../types';

/** True in the single-file hosted build, where the viewer blocks file downloads. */
const HOSTED = import.meta.env.VITE_HOSTED === '1';

export function Settings() {
  const { data, actions } = useStore();
  const { askConfirm, toast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(data.settings.userName);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [importError, setImportError] = useState('');
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const exportText = exportOpen ? serializeBackup(data) : '';

  const confirmReplace = (imported: AppData) => {
    setImportOpen(false);
    askConfirm({
      title: 'Replace your data?',
      message: `This backup has ${imported.assignments.length} assignments and ${imported.courses.length} classes. Your current data will be replaced. Consider exporting first.`,
      confirmLabel: 'Import backup',
      danger: true,
      onConfirm: () => {
        actions.replaceData(imported);
        setName(imported.settings.userName);
        toast('Backup imported', { tone: 'success' });
      },
    });
  };

  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      toast('Backup copied to clipboard', { tone: 'success' });
    } catch {
      exportRef.current?.focus();
      exportRef.current?.select();
      toast('Copy blocked here. The text is selected; press Ctrl/⌘+C.');
    }
  };
  const goalHours = data.settings.dailyStudyGoalMinutes / 60;

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      confirmReplace(await readImportFile(file));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setImportOpen(true);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" />

      <section className="card settings-section">
        <h2 className="settings-title">Profile</h2>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Your name</div>
            <div className="setting-desc">Used in the dashboard greeting.</div>
          </div>
          <input
            className="input setting-control"
            value={name}
            placeholder="Your name"
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== data.settings.userName && actions.updateSettings({ userName: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
      </section>

      <section className="card settings-section">
        <h2 className="settings-title">Appearance</h2>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Theme</div>
            <div className="setting-desc">System follows your device setting.</div>
          </div>
          <Segmented<ThemePreference>
            ariaLabel="Theme"
            value={data.settings.theme}
            onChange={(theme) => actions.updateSettings({ theme })}
            options={[
              { value: 'light', label: <span className="seg-inline"><Sun size={14} /> Light</span> },
              { value: 'dark', label: <span className="seg-inline"><Moon size={14} /> Dark</span> },
              { value: 'system', label: <span className="seg-inline"><Monitor size={14} /> System</span> },
            ]}
          />
        </div>
      </section>

      <section className="card settings-section">
        <h2 className="settings-title">Study planning</h2>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Daily study goal</div>
            <div className="setting-desc">Auto-fill in the Study Planner plans up to this much work per day.</div>
          </div>
          <div className="range-control">
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={goalHours}
              onChange={(e) => actions.updateSettings({ dailyStudyGoalMinutes: Math.round(Number(e.target.value) * 60) })}
              aria-label="Daily study goal in hours"
            />
            <span className="range-value">{goalHours}h</span>
          </div>
        </div>
      </section>

      <section className="card settings-section">
        <h2 className="settings-title">Data & backup</h2>
        <p className="setting-desc settings-note">
          Everything is saved automatically in this browser. Export a backup regularly, or to move your planner to another device.
        </p>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Export data</div>
            <div className="setting-desc">
              {data.assignments.length} assignments · {data.courses.length} classes, as JSON.
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setExportOpen(true)}>
            <Download size={15} /> Export
          </button>
        </div>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Import data</div>
            <div className="setting-desc">Restore from a Margin JSON backup file or pasted text.</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setPasted('');
              setImportError('');
              setImportOpen(true);
            }}
          >
            <Upload size={15} /> Import
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Load sample data</div>
            <div className="setting-desc">Replace everything with the demo semester.</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              askConfirm({
                title: 'Load sample data?',
                message: 'Your current assignments and classes will be replaced with demo data.',
                confirmLabel: 'Load sample data',
                danger: true,
                onConfirm: () => {
                  const sample = createSampleData();
                  actions.replaceData({ ...sample, settings: { ...sample.settings, userName: data.settings.userName || sample.settings.userName, theme: data.settings.theme } });
                  toast('Sample data loaded');
                },
              })
            }
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Start fresh</div>
            <div className="setting-desc">Delete all assignments, classes and plans. Settings are kept.</div>
          </div>
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() =>
              askConfirm({
                title: 'Delete all data?',
                message: 'All assignments, classes and study plans will be permanently deleted. This cannot be undone.',
                confirmLabel: 'Delete everything',
                danger: true,
                onConfirm: () => {
                  const empty = createEmptyData(data.settings.userName);
                  actions.replaceData({ ...empty, settings: data.settings });
                  toast('All data cleared');
                },
              })
            }
          >
            <Trash2 size={15} /> Clear all
          </button>
        </div>
      </section>

      <section className="card settings-section">
        <h2 className="settings-title">Keyboard shortcuts</h2>
        <ul className="shortcuts">
          <li><span>New assignment</span><Kbd>N</Kbd></li>
          <li><span>Search assignments</span><Kbd>/</Kbd></li>
          <li><span>Save in assignment form</span><span><Kbd>⌘/Ctrl</Kbd> <Kbd>Enter</Kbd></span></li>
          <li><span>Save & add another</span><span><Kbd>⇧</Kbd> <Kbd>⌘/Ctrl</Kbd> <Kbd>Enter</Kbd></span></li>
          <li><span>Go to Dashboard / Assignments / Week / Calendar</span><span><Kbd>G</Kbd> then <Kbd>D</Kbd> <Kbd>A</Kbd> <Kbd>W</Kbd> <Kbd>C</Kbd></span></li>
          <li><span>Quick add syntax</span><code className="code">Essay draft #engl fri 5pm !high ~2h</code></li>
        </ul>
      </section>
      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export backup"
        footer={
          <div className="footer-actions">
            {!HOSTED && (
              <button type="button" className="btn btn-secondary" onClick={() => exportData(data)}>
                <Download size={15} /> Download file
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={copyBackup}>
              <Copy size={15} /> Copy backup
            </button>
          </div>
        }
      >
        <div className="form-stack">
          <p className="setting-desc">
            Save this text somewhere safe, such as a note or a file named <code className="code">margin-backup.json</code>. Paste it into Import to restore.
          </p>
          <textarea id="export-json" ref={exportRef} className="input textarea backup-text" readOnly value={exportText} onFocus={(e) => e.target.select()} aria-label="Backup JSON" />
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import backup"
        footer={
          <div className="footer-actions">
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Choose file…
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!pasted.trim()}
              onClick={() => {
                try {
                  confirmReplace(parseBackupText(pasted));
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : 'Import failed');
                }
              }}
            >
              Restore pasted backup
            </button>
          </div>
        }
      >
        <div className="form-stack">
          <p className="setting-desc">Choose a backup file, or paste the backup text below.</p>
          <textarea
            id="import-json"
            data-autofocus
            className="input textarea backup-text"
            placeholder='{"version": 1, "courses": [...], "assignments": [...]}'
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setImportError('');
            }}
            aria-label="Paste backup JSON"
          />
          {importError && <div className="form-error">{importError}</div>}
        </div>
      </Modal>
    </div>
  );
}
