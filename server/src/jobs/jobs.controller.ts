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
    return { jobId: job.id, status: job.status, error: job.error };
  }

  /**
   * Synchronous export: validate, run the ffmpeg pipeline through the
   * single-slot queue, and return when the file is ready. The request holds
   * open for the duration — fine for short clips, and keeps the client simple.
   */
  @Post(':id/export')
  async export(@Param('id') id: string, @Body() dto: ExportDto) {
    const job = this.jobs.get(id);
    if (job.status === 'downloading') {
      throw new BadRequestException('Source is still downloading.');
    }
    this.validateClips(dto, job.duration);

    const fadeDuration = dto.fadeDuration ?? Math.min(0.5, LIMITS.MAX_TRANSITION_DURATION);

    this.jobs.setStatus(id, 'processing');
    try {
      const outputPath = await this.queue.run(() =>
        this.ffmpeg.export(id, job.sourcePath, dto.clips, dto.transition, fadeDuration),
      );
      this.jobs.update(id, { status: 'done', outputPath });
      await this.storage.cleanupIntermediate(id);
      return { jobId: id, status: 'done' };
    } catch (err) {
      this.jobs.setStatus(id, 'failed', (err as Error).message);
      this.logger.error(`export failed for ${id}: ${(err as Error).message}`);
      throw new BadRequestException('Export failed while processing the video.');
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
