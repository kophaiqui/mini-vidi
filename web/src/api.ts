export type Transition = 'cut' | 'fade';

export interface Clip {
  id: string;
  start: number;
  end: number;
  /** Transition into the next clip; ignored on the last clip. */
  transitionAfter?: Transition;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface ImportResult {
  jobId: string;
  duration: number;
  status: string;
}

export type JobStatus = 'downloading' | 'ready' | 'processing' | 'done' | 'failed';

export interface JobState {
  jobId: string;
  status: JobStatus;
  progress: number;
  error?: string;
}

export const api = {
  import: (url: string) => post<ImportResult>('/api/import', { url }),

  // The server reads transitionAfter off each clip (last one's is ignored).
  export: (jobId: string, clips: Clip[], fadeDuration: number) =>
    post<{ status: string }>(`/api/jobs/${jobId}/export`, { clips, fadeDuration }),

  status: (jobId: string) => get<JobState>(`/api/jobs/${jobId}`),

  sourceUrl: (jobId: string) => `/api/videos/${jobId}/source`,
  frameUrl: (jobId: string, t: number) => `/api/videos/${jobId}/frame?t=${t}`,
  downloadUrl: (jobId: string) => `/api/jobs/${jobId}/download`,
};
