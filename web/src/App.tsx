import { useRef, useState } from 'react';
import { api, Clip, Transition } from './api';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'failed';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const [clips, setClips] = useState<Clip[]>([]);
  const [draftStart, setDraftStart] = useState<number | null>(null);
  const [draftEnd, setDraftEnd] = useState<number | null>(null);

  const [transition, setTransition] = useState<Transition>('cut');
  const [fadeDuration, setFadeDuration] = useState(0.5);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = status === 'loading' || status === 'processing';

  async function handleLoad() {
    setError(null);
    setStatus('loading');
    try {
      const res = await api.import(url.trim());
      setJobId(res.jobId);
      setDuration(res.duration);
      setClips([]);
      setDraftStart(null);
      setDraftEnd(null);
      setStatus('ready');
    } catch (e) {
      setError((e as Error).message);
      setStatus('failed');
    }
  }

  const now = () => videoRef.current?.currentTime ?? 0;

  function addClip() {
    if (draftStart === null || draftEnd === null) return;
    if (draftEnd <= draftStart) {
      setError('End must be after start.');
      return;
    }
    setError(null);
    setClips((c) => [...c, { start: +draftStart.toFixed(2), end: +draftEnd.toFixed(2) }]);
    setDraftStart(null);
    setDraftEnd(null);
  }

  async function handleExport() {
    if (!jobId || clips.length === 0) return;
    setError(null);
    setStatus('processing');
    try {
      await api.export(jobId, clips, transition, fadeDuration);
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('failed');
    }
  }

  const totalOut = clips.reduce((sum, c) => sum + (c.end - c.start), 0);

  return (
    <div className="app">
      <header>
        <h1>Video Editor Mini</h1>
        <p className="sub">Paste a YouTube link · pick clips · merge · export</p>
      </header>

      <section className="card">
        <label className="field-label">YouTube URL</label>
        <div className="row">
          <input
            className="url-input"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && handleLoad()}
          />
          <button onClick={handleLoad} disabled={busy || !url.trim()}>
            {status === 'loading' ? 'Loading…' : 'Load'}
          </button>
        </div>
        {status === 'loading' && <p className="hint">Downloading source — this can take a moment.</p>}
      </section>

      {jobId && (
        <>
          <section className="card">
            <video
              ref={videoRef}
              className="preview"
              src={api.sourceUrl(jobId)}
              controls
            />
            <div className="timeline">
              <span>0:00</span>
              <span>{fmt(duration)}</span>
            </div>
          </section>

          <section className="card">
            <label className="field-label">Select a clip</label>
            <div className="row clip-picker">
              <button onClick={() => setDraftStart(now())}>Set Start</button>
              <span className="time-chip">{draftStart === null ? '—' : fmt(draftStart)}</span>
              <span className="arrow">→</span>
              <button onClick={() => setDraftEnd(now())}>Set End</button>
              <span className="time-chip">{draftEnd === null ? '—' : fmt(draftEnd)}</span>
              <button
                className="primary"
                onClick={addClip}
                disabled={draftStart === null || draftEnd === null}
              >
                Add Clip
              </button>
            </div>
            <p className="hint">Scrub the video, then mark the start and end of each segment.</p>
          </section>

          {clips.length > 0 && (
            <section className="card">
              <label className="field-label">Selected clips ({clips.length})</label>
              <ul className="clip-list">
                {clips.map((c, i) => (
                  <li key={i}>
                    <span className="badge">#{i + 1}</span>
                    <span>
                      {fmt(c.start)} → {fmt(c.end)}
                    </span>
                    <span className="dur">{(c.end - c.start).toFixed(1)}s</span>
                    <button
                      className="ghost"
                      onClick={() => setClips((cs) => cs.filter((_, j) => j !== i))}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">Total output: {totalOut.toFixed(1)}s</p>
            </section>
          )}

          <section className="card">
            <label className="field-label">Transition</label>
            <div className="row transition-row">
              <label className="radio">
                <input
                  type="radio"
                  checked={transition === 'cut'}
                  onChange={() => setTransition('cut')}
                />
                Cut
              </label>
              <label className="radio">
                <input
                  type="radio"
                  checked={transition === 'fade'}
                  onChange={() => setTransition('fade')}
                />
                Fade
              </label>
              {transition === 'fade' && (
                <label className="fade-dur">
                  Fade duration
                  <input
                    type="number"
                    min={0.1}
                    max={2}
                    step={0.1}
                    value={fadeDuration}
                    onChange={(e) => setFadeDuration(Number(e.target.value))}
                  />
                  s
                </label>
              )}
            </div>
          </section>

          <section className="card export">
            <button
              className="primary big"
              onClick={handleExport}
              disabled={busy || clips.length === 0}
            >
              {status === 'processing' ? 'Processing…' : 'Export Video'}
            </button>

            <div className="status">
              <StatusPill status={status} />
              {status === 'done' && jobId && (
                <a className="download" href={api.downloadUrl(jobId)}>
                  ⬇ Download
                </a>
              )}
            </div>
          </section>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    idle: 'Ready',
    loading: 'Loading source…',
    ready: 'Ready to edit',
    processing: 'Processing…',
    done: 'Done',
    failed: 'Failed',
  };
  return <span className={`pill pill-${status}`}>{map[status]}</span>;
}
