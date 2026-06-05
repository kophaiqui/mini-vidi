import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { JobsStore } from '../jobs/jobs.store';
import { streamFile } from '../common/stream-file';

@Controller('videos')
export class VideosController {
  constructor(private readonly jobs: JobsStore) {}

  /** Streamed source for the <video> preview (supports seeking via Range). */
  @Get(':id/source')
  source(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const job = this.jobs.get(id);
    streamFile(job.sourcePath, req, res);
  }
}
