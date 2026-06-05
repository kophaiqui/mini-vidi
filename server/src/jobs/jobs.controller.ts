import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LIMITS } from '../config/limits';
import { streamFile } from '../common/stream-file';
import { FfmpegService } from '../processing/ffmpeg.service';
import { QueueService } from '../processing/queue.service';
import { StorageService } from '../storage/storage.service';
import { ExportDto } from './export.dto';
import { JobsStore } from './jobs.store';

@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly jobs: JobsStore,
    private readonly ffmpeg: FfmpegService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  @Get(':id')
  status(@Param('id') id: string) {
    const job = this.jobs.get(id);
    return { jobId: job.id, status: job.status, progress: job.progress ?? 0, error: job.error };
  }

  /**
   * Async export: validate the request synchronously, enqueue the ffmpeg
   * pipeline on the single-slot queue, and return immediately. Clients poll
   * GET /jobs/:id for status + progress. Heavy clips can take minutes, so we
   * never hold the request open for the duration.
   */
  @Post(':id/export')
  export(@Param('id') id: string, @Body() dto: ExportDto) {
    const job = this.jobs.get(id);
    if (job.status === 'downloading') {
      throw new BadRequestException('Source is still downloading.');
    }
    if (job.status === 'processing') {
      throw new BadRequestException('An export is already running for this video.');
    }
    this.validateClips(dto, job.duration);

    const fadeDuration = dto.fadeDuration ?? Math.min(0.5, LIMITS.MAX_TRANSITION_DURATION);

    this.jobs.update(id, { status: 'processing', progress: 0, error: undefined });
    // Fire-and-forget through the queue; runExport owns all status updates.
    void this.queue.run(() => this.runExport(id, job.sourcePath, dto, fadeDuration));

    return { jobId: id, status: 'accepted' };
  }

  private async runExport(
    id: string,
    sourcePath: string,
    dto: ExportDto,
    fadeDuration: number,
  ): Promise<void> {
    try {
      const outputPath = await this.ffmpeg.export(id, sourcePath, dto.clips, fadeDuration, (p) =>
        this.jobs.update(id, { progress: p }),
      );
      this.jobs.update(id, { status: 'done', progress: 100, outputPath });
      await this.storage.cleanupIntermediate(id);
    } catch (err) {
      this.jobs.setStatus(id, 'failed', (err as Error).message);
      this.logger.error(`export failed for ${id}: ${(err as Error).message}`);
    }
  }

  @Get(':id/download')
  download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const job = this.jobs.get(id);
    if (job.status !== 'done') {
      throw new BadRequestException('Output is not ready.');
    }
    streamFile(job.outputPath, req, res, { downloadAs: `clip-${id}.mp4` });
  }

  private validateClips(dto: ExportDto, sourceDuration?: number): void {
    let total = 0;
    for (const clip of dto.clips) {
      if (clip.end <= clip.start) {
        throw new BadRequestException('Each clip must end after it starts.');
      }
      if (sourceDuration && clip.end > sourceDuration + 0.5) {
        throw new BadRequestException('A clip extends past the end of the video.');
      }
      total += clip.end - clip.start;
    }
    if (total > LIMITS.MAX_TOTAL_OUTPUT_DURATION) {
      throw new BadRequestException(
        `Total output ${Math.round(total)}s exceeds the ${LIMITS.MAX_TOTAL_OUTPUT_DURATION}s limit.`,
      );
    }
  }
}
