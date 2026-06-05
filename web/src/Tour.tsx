import { useEffect, useLayoutEffect, useState } from 'react';

export interface TourStep {
  /** CSS selector for the element to highlight, or null for a centered card. */
  selector: string | null;
  title: string;
  body: string;
}

/** The onboarding flow — mirrors the "User flow" section of the README. */
export const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="url"]',
    title: '1 · Paste a YouTube URL',
    body: 'Paste a link and click Load. The app downloads the video so you can edit it.',
  },
  {
    selector: '[data-tour="preview"]',
    title: '2 · Preview the video',
    body: 'Play and scrub the video in this player. The current position is what the clip buttons use.',
  },
  {
    selector: '[data-tour="picker"]',
    title: '3 · Select clip ranges',
    body: 'Scrub to a moment and click Set Start, scrub forward and click Set End, then Add Clip. Repeat for as many segments as you want.',
  },
  {
    selector: '[data-tour="clips"]',
    title: '4 · Arrange the clips',
    body: 'Reorder clips with the up/down arrows or delete one. The final video is built top to bottom.',
  },
  {
    selector: '[data-tour="clips"]',
    title: '5 · Choose transitions',
    body: 'Between each pair of clips pick Cut (a hard join) or Fade (the first clip fades out and the next fades in).',
  },
  {
    selector: '[data-tour="export"]',
    title: '6 · Export',
    body: 'Click Export Video. A progress bar fills as the clips are cut and joined into one video.',
  },
  {
    selector: '[data-tour="export"]',
    title: '7 · Download',
    body: 'When it finishes, click Download to save the final MP4.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 320;
const MARGIN = 12;
const CARD_EST_H = 180;

export function Tour({
  steps,
  index,
  onPrev,
  onNext,
  onClose,
}: {
  steps: TourStep[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // Locate + track the highlighted element for the current step.
  useLayoutEffect(() => {
    if (!step.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.selector, index]);

  // Keyboard: Esc closes, ←/→ and Enter navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') onNext();
      else if (e.key === 'ArrowLeft') {
        if (!isFirst) onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev, isFirst]);

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  let cardStyle: React.CSSProperties;
  if (spot) {
    const below = spot.top + spot.height + MARGIN;
    const top =
      below + CARD_EST_H <= window.innerHeight ? below : Math.max(MARGIN, spot.top - CARD_EST_H - MARGIN);
    const left = Math.min(Math.max(spot.left, MARGIN), window.innerWidth - CARD_W - MARGIN);
    cardStyle = { top, left };
  } else {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <div className="tour-root">
      {spot ? (
        <>
          <div className="tour-blocker" onClick={onClose} />
          <div className="tour-spot" style={spot} />
        </>
      ) : (
        <div className="tour-blocker dim" onClick={onClose} />
      )}

      <div className="tour-card" style={{ ...cardStyle, width: CARD_W }}>
        <button className="tour-x" onClick={onClose} aria-label="Close tutorial">
          ×
        </button>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {!rect && step.selector && (
          <p className="tour-note">Load a video to see this step highlighted in the app.</p>
        )}

        <div className="tour-foot">
          <div className="tour-dots">
            {steps.map((_, i) => (
              <span key={i} className={i === index ? 'on' : ''} />
            ))}
          </div>
          <div className="tour-nav">
            <button onClick={onPrev} disabled={isFirst}>
              Back
            </button>
            <button className="primary" onClick={onNext}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
