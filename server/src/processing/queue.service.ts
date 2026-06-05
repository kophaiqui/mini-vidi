import { Injectable } from '@nestjs/common';

/**
 * Serializes heavy work to a single slot. On 0.5 vCPU, running two ffmpeg
 * pipelines at once means both crawl and memory doubles — so every export is
 * funneled through here and runs strictly one at a time. This is the core of
 * the "what breaks first / how we designed around it" story.
 */
@Injectable()
export class QueueService {
  private tail: Promise<unknown> = Promise.resolve();
  private depth = 0;

  get queueDepth(): number {
    return this.depth;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.depth++;
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => this.depth--,
      () => this.depth--,
    );
    return result;
  }
}
