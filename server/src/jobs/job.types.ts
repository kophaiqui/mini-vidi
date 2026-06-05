export type JobStatus =
  | 'downloading'
  | 'ready'
  | 'processing'
  | 'done'
  | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  dir: string;
  sourcePath: string;
  outputPath: string;
  duration?: number;
  error?: string;
  createdAt: number;
}
