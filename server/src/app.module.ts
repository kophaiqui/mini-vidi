import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ImportController } from './import/import.controller';
import { JobsController } from './jobs/jobs.controller';
import { JobsStore } from './jobs/jobs.store';
import { FfmpegService } from './processing/ffmpeg.service';
import { QueueService } from './processing/queue.service';
import { YoutubeService } from './processing/youtube.service';
import { StorageService } from './storage/storage.service';
import { VideosController } from './videos/videos.controller';

const WEB_DIR = process.env.WEB_DIR || join(process.cwd(), 'public');

@Module({
  imports: [
    // Serves the built React app in production (single-container deploy).
    // In dev this dir is absent and the UI runs on Vite — harmless 404s.
    ServeStaticModule.forRoot({
      rootPath: WEB_DIR,
      exclude: ['/api/(.*)'],
    }),
  ],
  controllers: [ImportController, VideosController, JobsController],
  providers: [JobsStore, StorageService, QueueService, YoutubeService, FfmpegService],
})
export class AppModule {}
