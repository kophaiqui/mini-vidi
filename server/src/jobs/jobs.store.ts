import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Job, JobStatus } from './job.types';

/**
 * In-memory job registry. The app is a single container with sequential
 * processing, so there is no reason to persist job state to disk or a DB.
 * If the container restarts, in-flight jobs are gone — an acceptable
 * tradeoff for a prototype (documented in the README).
 */
@Injectable()
export class JobsStore {
  private readonly jobs = new Map<string, Job>();

  create(makePaths: (id: string) => Pick<Job, 'dir' | 'sourcePath' | 'outputPath'>): Job {
    const id = randomUUID().slice(0, 8);
    const paths = makePaths(id);
    const job: Job = {
      id,
      status: 'downloading',
      createdAt: Date.now(),
      ...paths,
    };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  update(id: string, patch: Partial<Job>): Job {
    const job = this.get(id);
    Object.assign(job, patch);
    return job;
  }

  setStatus(id: string, status: JobStatus, error?: string): Job {
    return this.update(id, { status, error });
  }
}
