import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { JobsStore } from '../jobs/jobs.store';
import { FfmpegService } from '../processing/ffmpeg.service';
import { streamFile } from '../common/stream-file';

@Controller('videos')
export class VideosController {
  constructor(
    private readonly jobs: JobsStore,
    private readonly ffmpeg: FfmpegService,
  ) {}

  /** Streamed source for the <video> preview (supports seeking via Range). */
  @Get(':id/source')
  source(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const job = this.jobs.get(id);
    streamFile(job.sourcePath, req, res);
  }

  /** Single JPEG poster frame at ?t=<seconds>, used as a clip thumbnail. */
  @Get(':id/frame')
  frame(@Param('id') id: string, @Query('t') t: string, @Res() res: Response) {
    const job = this.jobs.get(id);
    const time = Number(t);
    const child = this.ffmpeg.thumbnail(job.sourcePath, Number.isFinite(time) ? time : 0);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    child.stdout.pipe(res);

    const fail = () => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    };
    child.on('error', fail);
    child.on('close', (code) => {
      if (code !== 0) fail();
    });
    // If the client disconnects, don't leave ffmpeg running.
    res.on('close', () => child.kill('SIGKILL'));
  }
}
