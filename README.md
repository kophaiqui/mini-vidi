# Video Editor Mini App

Paste a YouTube URL → preview → pick one or more clip ranges → merge with a
`cut` or `fade` transition → download the result. Built to run reliably inside
**0.5 vCPU / 1 GB RAM** (AWS ECS Fargate target).

- **Frontend:** React + Vite (single page, no global state library)
- **Backend:** NestJS (Express) + `yt-dlp` + `ffmpeg`
- **Storage:** local temp disk, streamed in and out — never buffered in memory

---

## User flow

1. **Paste a YouTube URL** and click **Load**. The app downloads the video.
2. **Preview** it in a normal video player you can play and scrub.
3. **Select clip ranges.** Scrub to a moment, click **Set Start**; scrub forward,
   click **Set End**; click **Add Clip**. Repeat for as many segments as you want.
4. **Arrange the clips.** Reorder them with the up/down arrows, or delete one.
   The output is built top-to-bottom in this order.
5. **Choose a transition** between each pair of clips: **Cut** (a hard join) or
   **Fade** (the first clip fades out, the next fades in).
6. **Export.** A progress bar fills as the clips are cut and joined into one video.
7. **Download** the finished MP4.

---

## Run it

### Docker (recommended — matches the target environment)

```bash
docker build -t video-editor .
docker run --rm -p 3000:3000 --memory=1g --cpus=0.5 video-editor
# open http://localhost:3000
```

The image bundles `ffmpeg`, `yt-dlp`, and `deno` (see *Reliability* below), and
serves the built UI and the API from the same container on port 3000.

### Local dev (two processes)

```bash
# requires: node 20, ffmpeg, yt-dlp on PATH
cd server && npm install && npm run dev      # API on :3000
cd web    && npm install && npm run dev      # UI on :5173 (proxies /api -> :3000)
```

---

## How it works

```
React UI ──HTTP──> NestJS API ──> yt-dlp (download)  ──> /tmp/<jobId>/source.mp4
                        │
                        └────────> ffmpeg (clip + merge) ──> /tmp/<jobId>/output.mp4
```

### API

| Method | Route                       | Purpose                                  |
| ------ | --------------------------- | ---------------------------------------- |
| POST   | `/api/import`               | Download a YouTube URL, return `jobId`   |
| GET    | `/api/videos/:id/source`    | Stream source for the `<video>` preview  |
| GET    | `/api/videos/:id/frame?t=`  | Single JPEG poster frame for a clip thumb |
| POST   | `/api/jobs/:id/export`      | Enqueue cut + merge, returns immediately |
| GET    | `/api/jobs/:id`             | Job status + progress (0–100)            |
| GET    | `/api/jobs/:id/download`    | Stream the final `output.mp4`            |

### Processing pipeline

1. **Probe then download.** `yt-dlp` reports duration first, so over-long videos
   are rejected *before* any bytes are downloaded. Downloads are capped at 720p.
2. **Extract each clip, re-encoded to identical parameters** (`libx264`, CRF 28,
   `veryfast`, 44.1 kHz stereo, `yuv420p`). Normalizing every clip is what makes
   the merge cheap.
3. **Merge** with the ffmpeg `concat` demuxer (always a stream copy, `-c copy` —
   no second re-encode). Transitions are baked into the clips during extraction:
   - `cut` boundary → no fade; clips butt straight against each other.
   - `fade` boundary → the left clip dips out to black and the right clip dips in
     from black (video `fade` + audio `afade`).
4. **Report progress** after each step (N clips + 1 merge) so the client can poll.
5. **Clean up** `source.mp4` and the per-clip files; keep `output.mp4`.

### Timeline and transition model

The editor models the output as an **ordered list of clips**, each with a source
time range and an optional `transitionAfter` field. Transitions therefore belong
to the **boundary between two clips**, not to the video as a whole — so every clip
except the last one carries its own transition:

```
Clip 1 ──fade──► Clip 2 ──cut──► Clip 3
```

This matches how editing timelines are normally modeled while keeping the
implementation simple: a `fade` boundary just means "fade the left clip out and
the next one in" at extraction time, so the merge stays a cheap stream copy.

Only **Cut** and **Fade** are implemented. **Slide** was considered but left as
future work — it needs a more complex ffmpeg filter graph and more CPU, and the
target runtime (0.5 vCPU / 1 GB RAM) prioritizes stable, predictable processing.

---

## Resource management — the design center

The whole system is shaped by **0.5 vCPU / 1 GB RAM**.

- **Video never touches application memory.** Every file is moved with
  `createReadStream` / `spawn` pipes — never `readFileSync`. `ffmpeg` and
  `yt-dlp` read and write the disk directly; Node only shuttles bytes through
  OS-level streams. The source preview uses HTTP **Range** so the browser pulls
  only what it plays.
- **One heavy process at a time.** All exports pass through a single-slot queue
  (`QueueService`). On half a core, two concurrent `ffmpeg` runs make both crawl
  and double memory pressure, so they are strictly serialized. `ffmpeg` itself
  runs with `-threads 1`.
- **Hard limits, enforced before work starts** (`server/src/config/limits.ts`):
  source ≤ 10 min, ≤ 10 clips, total output ≤ 5 min, fade ≤ 2 s. Requests over
  the line are rejected with a `400`, so a user can't queue an hour of 4K.
- **`fade` is dip-to-black, not a true crossfade.** A real `xfade` re-encodes the
  entire timeline and needs cumulative-offset bookkeeping per boundary — more CPU
  and more ways to fail on half a core. Dip-to-black gives a visible transition
  for a per-clip cost. (See *Engineering judgment*.)

### Reliability — why `deno` is in the image

`yt-dlp` now **deprecates YouTube extraction without a JavaScript runtime** —
without one, the separate video+audio streams often can't be deciphered and only
limited combined formats are available. The Docker image installs `deno` so
`yt-dlp` resolves formats reliably. (Locally the app still works via the
combined-format fallback, just less robustly.)

---

## Engineering judgment — what I chose *not* to build

| Skipped                         | Why                                                                 |
| ------------------------------- | ------------------------------------------------------------------- |
| Persistent job store (DB/disk)  | Single container → an in-memory `Map` is enough. Restart loses in-flight jobs; acceptable for a prototype. |
| True `xfade`/slide transitions  | CPU-heavy full-timeline re-encode; poor fit for 0.5 vCPU in scope.  |
| Drag-and-drop timeline          | `Move ↑ / ↓` reordering is faster to build and impossible to get subtly wrong; drag-drop is polish, not core. |
| Auth, multi-user, rate limiting | Out of scope for a prototype; belongs at the gateway (see Scaling). |

Export **is** asynchronous: `/export` validates and enqueues, returns immediately,
and the client polls `/jobs/:id` for status + progress. The single-slot queue
still serializes the actual `ffmpeg` work.

Trade-off summary: I optimized for **reliable end-to-end behavior under the
resource cap** and **readable, well-separated code** over feature breadth.

---

## What breaks first at 1,000 simultaneous users?

**CPU saturation on `ffmpeg`, immediately.**

A single export of a few short clips already uses meaningful CPU time, and this
container processes **one at a time** by design. Export is already asynchronous —
`/export` enqueues and returns, the client polls `/jobs/:id` — so the API doesn't
block on processing. But the queue and the worker live **in the same process**:
at 1,000 concurrent submissions 999 jobs pile up in one container's memory, that
single `ffmpeg` slot drains them serially over hours, and the unbounded backlog
plus growing `/tmp` fills RAM and disk. Disk filling with `source.mp4` files is a
close second; YouTube rate-limiting on concurrent downloads is a third.

**The ordered fix — decouple acceptance from processing:**

1. **Move the queue out of process** to **SQS** (or similar). The API only
   enqueues; it never runs `ffmpeg`. (The async `/export` + polling contract the
   client already speaks stays exactly the same.)
2. **Scale a worker pool horizontally.** Many small ECS workers, each pulling one
   job at a time (one `ffmpeg` per worker — same per-container discipline, now
   replicated). Throughput scales with worker count; autoscale on queue depth.
3. **Move storage to S3** and hand back a CloudFront/presigned download URL. Local
   disk stops being a bottleneck and a single point of failure.
4. **Protect the front door:** rate-limit per user/IP and cap the global queue so
   the system sheds load gracefully instead of collapsing.

```
React → API Gateway → NestJS API → SQS → ECS worker pool → S3 → CloudFront
```

The key shift: the prototype's *correct* instinct — "only one heavy job at a time
per box" — stays true; production just runs many such boxes behind a queue.
