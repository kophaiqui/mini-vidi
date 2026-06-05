import { BadRequestException, Body, Controller, Logger, Post } from '@nestjs/common';
import { LIMITS } from '../config/limits';
import { JobsStore } from '../jobs/jobs.store';
import { StorageService } from '../storage/storage.service';
import { YoutubeService } from '../processing/youtube.service';
import { ImportDto } from './import.dto';

@Controller('import')
export class ImportController {
  private readonly logger = new Logger(ImportController.name);

  constructor(
    private readonly jobs: JobsStore,
    private readonly storage: StorageService,
    private readonly youtube: YoutubeService,
  ) {}

  @Post()
  async import(@Body() dto: ImportDto) {
    // Reject long videos before spending bandwidth/disk on a download.
    const duration = await this.youtube.probeDuration(dto.url);
    if (duration > LIMITS.MAX_VIDEO_DURATION) {
      throw new BadRequestException(
        `Video is ${duration}s; limit is ${LIMITS.MAX_VIDEO_DURATION}s.`,
      );
    }

    const job = this.jobs.create((id) => this.storage.paths(id));
    await this.storage.ensureJobDir(job.id);

    try {
      await this.youtube.download(dto.url, job.sourcePath);
    } catch (err) {
      this.jobs.setStatus(job.id, 'failed', (err as Error).message);
      this.logger.error(`download failed for ${job.id}: ${(err as Error).message}`);
      throw new BadRequestException('Unable to download this video.');
    }

    this.jobs.update(job.id, { status: 'ready', duration });
    return { jobId: job.id, duration, status: 'ready' };
  }
}
