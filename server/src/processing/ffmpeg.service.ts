import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { LIMITS } from '../config/limits';
import { StorageService } from '../storage/storage.service';
import { run } from './process.util';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

export interface Clip {
  start: number;
  end: number;
}

export type Transition = 'cut' | 'fade';

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
   *  - "cut"  -> straight join (stream copy, fast)
   *  - "fade" -> each segment dips in/out of black, then join
   * Returns the path to output.mp4.
   */
  async export(
    jobId: string,
    sourcePath: string,
    clips: Clip[],
    transition: Transition,
    fadeDuration: number,
  ): Promise<string> {
    const { clipsDir, outputPath, dir } = this.storage.paths(jobId);
    await fs.mkdir(clipsDir, { recursive: true });

    const clipPaths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clipPath = join(clipsDir, `clip-${String(i).padStart(3, '0')}.mp4`);
      await this.extractClip(sourcePath, clips[i], transition, fadeDuration, clipPath);
      clipPaths.push(clipPath);
    }

    await this.merge(clipPaths, dir, outputPath);
    return outputPath;
  }

  private async extractClip(
    sourcePath: string,
    clip: Clip,
    transition: Transition,
    fadeDuration: number,
    destPath: string,
  ): Promise<void> {
    const duration = clip.end - clip.start;
    // -ss before -i = fast seek; -t = duration (avoids -to/-ss ambiguity).
    const args = ['-y', '-ss', String(clip.start), '-i', sourcePath, '-t', String(duration)];

    if (transition === 'fade') {
      const fade = Math.min(fadeDuration, duration / 2);
      const outStart = Math.max(0, duration - fade).toFixed(3);
      args.push(
        '-vf', `fade=t=in:st=0:d=${fade},fade=t=out:st=${outStart}:d=${fade}`,
        '-af', `afade=t=in:st=0:d=${fade},afade=t=out:st=${outStart}:d=${fade}`,
      );
    }

    args.push(...ENCODE_ARGS, destPath);
    this.logger.log(`extract ${destPath} (${duration}s, ${transition})`);
    await run(FFMPEG, args);
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
