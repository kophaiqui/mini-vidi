import { Injectable, Logger } from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { LIMITS } from '../config/limits';
import { StorageService } from '../storage/storage.service';
import { run } from './process.util';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

export type Transition = 'cut' | 'fade';

export interface Clip {
  start: number;
  end: number;
  /** Transition into the next clip; ignored on the last clip. */
  transitionAfter?: Transition;
}

/** Called as each pipeline step completes, with an integer 0–100. */
export type ProgressFn = (percent: number) => void;

// Normalized encode settings shared by every clip. Encoding all clips with the
// same codec/params is what lets the final merge use a stream copy (no second
// re-encode) for "cut", and keeps "fade" cheap.
const ENCODE_ARGS = [
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '28',
  '-threads', '1',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-ar', '44100',
  '-ac', '2',
  '-movflags', '+faststart',
];

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * Full export pipeline: cut each segment from the source, then concatenate.
   * Transitions live on the boundary between clips (clip.transitionAfter), so a
   * clip dips out of black only when its own boundary is a "fade", and dips in
   * from black only when the *previous* boundary was a "fade". A "cut" boundary
   * adds no fade on either side. The final merge is always a stream copy.
   *
   * `onProgress` is invoked after each step (N clips + 1 merge) so callers can
   * surface progress. Returns the path to output.mp4.
   */
  async export(
    jobId: string,
    sourcePath: string,
    clips: Clip[],
    fadeDuration: number,
    onProgress?: ProgressFn,
  ): Promise<string> {
    const { clipsDir, outputPath, dir } = this.storage.paths(jobId);
    await fs.mkdir(clipsDir, { recursive: true });

    const totalSteps = clips.length + 1; // each extract + the final merge
    const last = clips.length - 1;
    const clipPaths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clipPath = join(clipsDir, `clip-${String(i).padStart(3, '0')}.mp4`);
      // Fade in if the previous boundary is a fade; fade out if this clip's
      // boundary is a fade (never on the last clip — it has no "after").
      const fadeIn = i > 0 && clips[i - 1].transitionAfter === 'fade';
      const fadeOut = i < last && clips[i].transitionAfter === 'fade';
      await this.extractClip(sourcePath, clips[i], { fadeIn, fadeOut }, fadeDuration, clipPath);
      clipPaths.push(clipPath);
      onProgress?.(Math.round(((i + 1) / totalSteps) * 100));
    }

    await this.merge(clipPaths, dir, outputPath);
    onProgress?.(100);
    return outputPath;
  }

  private async extractClip(
    sourcePath: string,
    clip: Clip,
    fade: { fadeIn: boolean; fadeOut: boolean },
    fadeDuration: number,
    destPath: string,
  ): Promise<void> {
    const duration = clip.end - clip.start;
    // -ss before -i = fast seek; -t = duration (avoids -to/-ss ambiguity).
    const args = ['-y', '-ss', String(clip.start), '-i', sourcePath, '-t', String(duration)];

    if (fade.fadeIn || fade.fadeOut) {
      const d = Math.min(fadeDuration, duration / 2);
      const outStart = Math.max(0, duration - d).toFixed(3);
      const vf: string[] = [];
      const af: string[] = [];
      if (fade.fadeIn) {
        vf.push(`fade=t=in:st=0:d=${d}`);
        af.push(`afade=t=in:st=0:d=${d}`);
      }
      if (fade.fadeOut) {
        vf.push(`fade=t=out:st=${outStart}:d=${d}`);
        af.push(`afade=t=out:st=${outStart}:d=${d}`);
      }
      args.push('-vf', vf.join(','), '-af', af.join(','));
    }

    args.push(...ENCODE_ARGS, destPath);
    this.logger.log(`extract ${destPath} (${duration}s, in=${fade.fadeIn} out=${fade.fadeOut})`);
    await run(FFMPEG, args);
  }

  /**
   * Extract a single small JPEG frame at time `t` and stream it on stdout.
   * Fast-seek (`-ss` before `-i`) makes this near-instant, and only one tiny
   * image ever leaves the process — the source video is never buffered.
   * Returns the child so the caller can pipe stdout to the HTTP response.
   */
  thumbnail(sourcePath: string, t: number): ChildProcessWithoutNullStreams {
    const args = [
      '-ss', String(Math.max(0, t)),
      '-i', sourcePath,
      '-frames:v', '1',
      '-vf', 'scale=240:-2',
      '-q:v', '6',
      '-f', 'mjpeg',
      'pipe:1',
    ];
    return spawn(FFMPEG, args);
  }

  private async merge(clipPaths: string[], dir: string, outputPath: string): Promise<void> {
    // concat demuxer needs a list file; single-quote-escape paths for safety.
    const listPath = join(dir, 'concat.txt');
    const listBody = clipPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.writeFile(listPath, listBody + '\n');

    this.logger.log(`merge ${clipPaths.length} clips -> ${outputPath}`);
    await run(FFMPEG, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]);
  }

  // Re-exported for the controller's validation messages.
  get maxTransition() {
    return LIMITS.MAX_TRANSITION_DURATION;
  }
}
