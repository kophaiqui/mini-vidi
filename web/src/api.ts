export interface Clip {
  start: number;
  end: number;
}

export type Transition = 'cut' | 'fade';

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

export interface ImportResult {
  jobId: string;
  duration: number;
  status: string;
}

export const api = {
  import: (url: string) => post<ImportResult>('/api/import', { url }),

  export: (jobId: string, clips: Clip[], transition: Transition, fadeDuration: number) =>
    post<{ status: string }>(`/api/jobs/${jobId}/export`, { clips, transition, fadeDuration }),

  sourceUrl: (jobId: string) => `/api/videos/${jobId}/source`,
  downloadUrl: (jobId: string) => `/api/jobs/${jobId}/download`,
};
