import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Owns the on-disk layout for jobs:
 *
 *   <base>/<jobId>/source.mp4
 *   <base>/<jobId>/clips/clip-000.mp4
 *   <base>/<jobId>/output.mp4
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly base = process.env.VIDEO_TMP_DIR || join(tmpdir(), 'video-editor');

  paths(id: string) {
    const dir = join(this.base, id);
    return {
      dir,
      sourcePath: join(dir, 'source.mp4'),
      outputPath: join(dir, 'output.mp4'),
      clipsDir: join(dir, 'clips'),
    };
  }

  async ensureJobDir(id: string): Promise<void> {
    await fs.mkdir(join(this.base, id, 'clips'), { recursive: true });
  }

  /** Remove the intermediate source + clips after a job finishes, keep output. */
  async cleanupIntermediate(id: string): Promise<void> {
    const { sourcePath, clipsDir } = this.paths(id);
    await Promise.allSettled([
      fs.rm(sourcePath, { force: true }),
      fs.rm(clipsDir, { recursive: true, force: true }),
    ]).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') this.logger.warn(`cleanup: ${r.reason}`);
      }
    });
  }
}
