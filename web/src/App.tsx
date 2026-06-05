import { useEffect, useRef, useState } from 'react';
import { api, Clip, Transition } from './api';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `clip-${Math.random().toString(36).slice(2)}`;
}

type Status = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'failed';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const [clips, setClips] = useState<Clip[]>([]);
  const [draftStart, setDraftStart] = useState<number | null>(null);
  const [draftEnd, setDraftEnd] = useState<number | null>(null);

  const [fadeDuration, setFadeDuration] = useState(0.5);

  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = status === 'loading' || status === 'processing';
  const usesFade = clips.some((c, i) => i < clips.length - 1 && c.transitionAfter === 'fade');

  // Stop polling if the component unmounts mid-export.
  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleLoad() {
    setLoadError(null);
    setStatus('loading');
    try {
      const res = await api.import(url.trim());
      setJobId(res.jobId);
      setDuration(res.duration);
      setClips([]);
      setDraftStart(null);
      setDraftEnd(null);
      setProgress(0);
      setStatus('ready');
    } catch (e) {
      setLoadError((e as Error).message);
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
    // New clips default to a hard cut into whatever follows them.
    setClips((c) => [
      ...c,
      { id: newId(), start: +draftStart.toFixed(2), end: +draftEnd.toFixed(2), transitionAfter: 'cut' },
    ]);
    setDraftStart(null);
    setDraftEnd(null);
  }

  function removeClip(id: string) {
    setClips((cs) => cs.filter((c) => c.id !== id));
  }

  function moveClip(index: number, dir: -1 | 1) {
    setClips((cs) => {
      const next = [...cs];
      const target = index + dir;
      if (target < 0 || target >= next.length) return cs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setTransition(id: string, t: Transition) {
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, transitionAfter: t } : c)));
  }

  async function handleExport() {
    if (!jobId || clips.length === 0) return;
    stopPolling();
    setError(null);
    setProgress(0);
    setStatus('processing');
    try {
      await api.export(jobId, clips, fadeDuration);
      pollStatus(jobId);
    } catch (e) {
      setError((e as Error).message);
      setStatus('failed');
    }
  }

  function pollStatus(id: string) {
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.status(id);
        setProgress(s.progress);
        if (s.status === 'done') {
          stopPolling();
          setStatus('done');
        } else if (s.status === 'failed') {
          stopPolling();
          setError(s.error || 'Export failed while processing the video.');
          setStatus('failed');
        }
      } catch (e) {
        stopPolling();
        setError((e as Error).message);
        setStatus('failed');
      }
    }, 1000);
  }

  const totalOut = clips.reduce((sum, c) => sum + (c.end - c.start), 0);

  return (
    <div className="app">
      <header>
        <h1>Video Editor Mini</h1>
        <p className="sub">Paste a YouTube link · pick clips · arrange · merge · export</p>
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
        {loadError && <p className="error inline-error">{loadError}</p>}
      </section>

      {jobId && (
        <>
          <section className="card">
            <video ref={videoRef} className="preview" src={api.sourceUrl(jobId)} controls />
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
            <>
              <section className="card">
                <label className="field-label">Timeline</label>
                <div className="mini-timeline">
                  {clips.map((c, i) => (
                    <div className="mt-node" key={c.id}>
                      <div className="mt-clip">
                        <img className="mt-thumb" src={api.frameUrl(jobId, c.start)} alt="" />
                        <span className="mt-index">#{i + 1}</span>
                        <span className="mt-range">
                          {fmt(c.start)}–{fmt(c.end)}
                        </span>
                      </div>
                      {i < clips.length - 1 && (
                        <span className={`mt-link mt-link-${c.transitionAfter}`}>
                          {c.transitionAfter === 'fade' ? 'fade' : 'cut'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="hint">Final video is built left → right.</p>
              </section>

              <section className="card">
                <label className="field-label">Selected clips ({clips.length})</label>
                <ul className="clip-list">
                  {clips.map((c, i) => {
                    const isLast = i === clips.length - 1;
                    return (
                      <li key={c.id}>
                        <div className="clip-row">
                          <img className="clip-thumb" src={api.frameUrl(jobId, c.start)} alt="" />
                          <span className="badge">#{i + 1}</span>
                          <span>
                            {fmt(c.start)} → {fmt(c.end)}
                          </span>
                          <span className="dur">{(c.end - c.start).toFixed(1)}s</span>
                          <div className="clip-actions">
                            <button className="ghost-btn" onClick={() => moveClip(i, -1)} disabled={i === 0} title="Move up">
                              ↑
                            </button>
                            <button
                              className="ghost-btn"
                              onClick={() => moveClip(i, 1)}
                              disabled={isLast}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <button className="ghost" onClick={() => removeClip(c.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                        {!isLast && (
                          <div className="clip-transition">
                            <span className="ct-label">Transition after:</span>
                            <div className="seg">
                              <button
                                className={c.transitionAfter !== 'fade' ? 'seg-on' : ''}
                                onClick={() => setTransition(c.id, 'cut')}
                              >
                                Cut
                              </button>
                              <button
                                className={c.transitionAfter === 'fade' ? 'seg-on' : ''}
                                onClick={() => setTransition(c.id, 'fade')}
                              >
                                Fade
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="clip-footer">
                  <span className="hint">Total output: {totalOut.toFixed(1)}s</span>
                  {usesFade && (
                    <label className="fade-dur">
                      Fade
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
            </>
          )}

          <section className="card export">
            <button className="primary big" onClick={handleExport} disabled={busy || clips.length === 0}>
              {status === 'processing' ? 'Processing…' : 'Export Video'}
            </button>

            {status === 'processing' && (
              <div className="progress">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="status">
              <StatusPill status={status} progress={progress} />
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

function StatusPill({ status, progress }: { status: Status; progress: number }) {
  const map: Record<Status, string> = {
    idle: 'Ready',
    loading: 'Loading source…',
    ready: 'Ready to edit',
    processing: `Processing… ${progress}%`,
    done: 'Done',
    failed: 'Failed',
  };
  return <span className={`pill pill-${status}`}>{map[status]}</span>;
}
