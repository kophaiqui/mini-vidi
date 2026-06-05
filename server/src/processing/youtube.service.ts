import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LIMITS } from '../config/limits';
import { run } from './process.util';

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

/**
 * Wraps yt-dlp. Downloads are capped at 720p so a single source never blows up
 * disk usage or the subsequent encode cost.
 */
@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  /** Cheap metadata-only call so we can reject long videos before downloading. */
  async probeDuration(url: string): Promise<number> {
    try {
      const { stdout } = await run(YTDLP, [
        '--no-playlist',
        '--skip-download',
        '--print',
        '%(duration)s',
        url,
      ]);
      const duration = Number(stdout.split('\n')[0]);
      if (!Number.isFinite(duration)) {
        throw new Error(`Could not read duration (got "${stdout}")`);
      }
      return Math.round(duration);
    } catch (err) {
      this.logger.warn(`probe failed: ${(err as Error).message}`);
      throw new BadRequestException('Unable to read this video (private, age-restricted, or invalid URL).');
    }
  }

  async download(url: string, destPath: string): Promise<void> {
    const format = `bv*[height<=${LIMITS.MAX_HEIGHT}]+ba/b[height<=${LIMITS.MAX_HEIGHT}]`;
    await run(YTDLP, [
      '--no-playlist',
      '--no-progress',
      '-f',
      format,
      '--merge-output-format',
      'mp4',
      '-o',
      destPath,
      url,
    ]);
  }
}
