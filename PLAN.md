# Video Editor Mini App - Technical Design & Implementation Plan

## Overview

This document describes the proposed architecture, UI design, backend implementation, resource management strategy, and scaling considerations for the Video Editor Mini App.

---

# Goals

Allow users to:

1. Input a YouTube URL
2. Download and preview the video
3. Select one or more clip ranges
4. Merge selected clips
5. Apply transitions between clips
6. Export and download the final video

The solution must operate reliably under:

```text
0.5 vCPU
1 GB RAM
```

and be runnable inside Docker.

---

# Design Principles

## Priorities

1. Reliability under resource constraints
2. Simple architecture
3. Fast implementation
4. Easy to reason about
5. Clear separation of concerns

## Explicit Trade-offs

### Chosen

* Local temporary storage
* Sequential video processing
* Limited transitions (Cut + Fade)
* Polling-based job status
* Single-container deployment

### Not Chosen

* Distributed processing
* Real-time progress streaming
* GPU acceleration
* Complex timeline editor
* Multi-user collaboration

Reason:

The assignment prioritizes engineering judgment and resource awareness over feature completeness.

---

# High-Level Architecture

```text
┌─────────────────────────┐
│       React UI          │
└───────────┬─────────────┘
            │ HTTP
            ▼
┌─────────────────────────┐
│      NestJS API         │
│                         │
│ - Import video          │
│ - Create job            │
│ - Track status          │
│ - Stream files          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│     Video Service       │
│                         │
│ yt-dlp                  │
│ ffmpeg                  │
│ filesystem storage      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Local Temp Storage    │
│     /tmp/jobs/...       │
└─────────────────────────┘
```

---

# Frontend Design

## Main Screen Layout

```text
+--------------------------------------------------+
|               Video Editor Mini App              |
+--------------------------------------------------+

[ YouTube URL                             ][Load]

----------------------------------------------------

Video Preview

+--------------------------------------+
|                                      |
|           HTML5 Video                |
|                                      |
+--------------------------------------+

Timeline

0:00 -------------------------------- 5:20

[===== selected clip =====]

Start: [00:10]
End:   [00:25]

[ Add Clip ]

----------------------------------------------------

Selected Clips

#1 00:10 → 00:25    [Delete]
#2 01:15 → 01:30    [Delete]
#3 02:10 → 02:25    [Delete]

----------------------------------------------------

Transition

(o) Cut
( ) Fade

Fade Duration: [0.5]

----------------------------------------------------

[ Export Video ]

----------------------------------------------------

Status

Ready
Processing...
Done

[ Download ]
```

---

# UI Components

## 1. URL Input

Responsibilities:

* Accept YouTube URL
* Validate format
* Trigger import

State:

```typescript
{
  url: string;
  loading: boolean;
}
```

---

## 2. Video Preview

Implementation:

```html
<video controls />
```

Responsibilities:

* Preview source video
* Allow seeking
* Display current position

---

## 3. Clip Selector

Responsibilities:

* Select start time
* Select end time
* Create clip entries

State:

```typescript
{
  start: number;
  end: number;
}
```

---

## 4. Clip List

Responsibilities:

* Display selected clips
* Delete clips
* Reorder clips (optional)

Model:

```typescript
type Clip = {
  start: number;
  end: number;
};
```

---

## 5. Transition Selector

Supported:

```typescript
type Transition =
  | "cut"
  | "fade";
```

Default:

```text
cut
```

---

## 6. Export Section

Responsibilities:

* Trigger export
* Display processing status
* Show download button

---

## Frontend State

```typescript
{
  jobId: string | null;

  videoUrl: string | null;

  clips: Clip[];

  transition: "cut" | "fade";

  status:
    | "idle"
    | "ready"
    | "processing"
    | "done"
    | "failed";

  progress: number;
}
```

---

# Backend Design

## Modules

```text
src/

modules/

  import/
    import.controller.ts
    import.service.ts

  jobs/
    jobs.controller.ts
    jobs.service.ts

  videos/
    videos.controller.ts

  ffmpeg/
    ffmpeg.service.ts

  storage/
    storage.service.ts

shared/
```

---

# Storage Structure

```text
/tmp/video-editor

jobs/

  job-001/

      source.mp4

      clips/

          clip-001.mp4
          clip-002.mp4

      output.mp4

      metadata.json

  job-002/
```

---

# Job Lifecycle

```text
CREATED

↓

DOWNLOADING

↓

READY

↓

PROCESSING

↓

DONE

or

FAILED
```

---

# API Design

## Import Video

### Request

```http
POST /api/import
```

```json
{
  "url": "https://youtube.com/..."
}
```

### Process

```text
Validate URL

↓

yt-dlp download

↓

save source.mp4

↓

extract metadata

↓

return jobId
```

### Response

```json
{
  "jobId": "abc123",
  "duration": 320,
  "status": "ready"
}
```

---

## Get Job Status

### Request

```http
GET /api/jobs/:jobId
```

### Response

```json
{
  "status": "processing",
  "progress": 70
}
```

---

## Stream Source Video

### Request

```http
GET /api/videos/:jobId/source
```

### Implementation

```typescript
createReadStream(filePath);
```

No file buffering is allowed.

---

## Export Video

### Request

```http
POST /api/jobs/:jobId/export
```

### Body

```json
{
  "clips": [
    {
      "start": 10,
      "end": 25
    },
    {
      "start": 70,
      "end": 90
    }
  ],
  "transition": "cut"
}
```

### Response

```json
{
  "status": "accepted"
}
```

---

## Download Output

### Request

```http
GET /api/jobs/:jobId/download
```

### Response

```text
output.mp4
```

Returned using streaming.

---

# Video Processing Pipeline

## Step 1 — Download Source

Tool:

```text
yt-dlp
```

Output:

```text
source.mp4
```

---

## Step 2 — Extract Clips

Input:

```text
source.mp4
```

Output:

```text
clip-001.mp4
clip-002.mp4
clip-003.mp4
```

Command:

```bash
ffmpeg \
-ss START \
-to END \
-i source.mp4 \
-c:v libx264 \
-preset veryfast \
-crf 28 \
-threads 1 \
clip.mp4
```

---

## Step 3 — Create Concat List

```text
file 'clip-001.mp4'
file 'clip-002.mp4'
file 'clip-003.mp4'
```

---

## Step 4 — Merge Clips

```bash
ffmpeg \
-f concat \
-safe 0 \
-i list.txt \
-c copy \
output.mp4
```

---

## Step 5 — Optional Fade Transition

Implemented using FFmpeg filter graph.

Trade-off:

```text
Higher CPU usage
Longer processing time
Requires re-encoding
```

Therefore:

```text
Cut = default
Fade = optional
```

---

# Resource Management

## Main Principle

Video files must never be loaded into application memory.

Use:

```typescript
createReadStream(...)
```

Never:

```typescript
readFileSync(...)
```

---

# Memory Protection

## Limits

```typescript
MAX_VIDEO_DURATION = 10 * 60;

MAX_CLIPS = 10;

MAX_TOTAL_OUTPUT_DURATION = 5 * 60;

MAX_TRANSITION_DURATION = 2;
```

Requests exceeding limits are rejected.

---

# CPU Protection

Only one FFmpeg process is allowed per container.

```typescript
let processing = false;
```

This prevents CPU starvation on:

```text
0.5 vCPU
```

---

# FFmpeg Configuration

```bash
-preset veryfast
-crf 28
-threads 1
```

Reason:

```text
Lower CPU usage
Lower memory usage
Acceptable quality
```

---

# Failure Handling

## Download Failure

Examples:

```text
Invalid URL
Video unavailable
Network timeout
```

Response:

```json
{
  "status": "failed",
  "message": "Unable to download video"
}
```

---

## FFmpeg Failure

Examples:

```text
Corrupted file
Invalid clip range
Processing timeout
```

Job status:

```text
FAILED
```

---

## Cleanup Strategy

After:

```text
DONE
FAILED
```

Delete:

```text
source.mp4
clips/
```

Retain:

```text
output.mp4
```

for limited time.

---

# Docker Strategy

Run with:

```bash
docker run \
--memory=1g \
--cpus=0.5 \
video-editor
```

This simulates the target ECS Fargate environment.

---

# What Would Break First?

Under 1,000 simultaneous users:

## 1. FFmpeg CPU Saturation

Each export operation is CPU intensive.

Symptoms:

```text
Long queues
Slow exports
Container overload
```

---

## 2. Temporary Storage Exhaustion

Each job creates:

```text
source.mp4
clips/
output.mp4
```

Disk usage grows rapidly.

---

## 3. Download Bandwidth

Large numbers of concurrent YouTube downloads may cause:

```text
Rate limiting
Network bottlenecks
```

---

## 4. Container Concurrency

Single-container architecture eventually becomes a bottleneck.

---

# Scaling Strategy

Current:

```text
User

↓

React

↓

NestJS

↓

FFmpeg

↓

Local Disk
```

Future:

```text
User

↓

API

↓

SQS Queue

↓

ECS Worker Pool

↓

S3 Storage

↓

Download URL
```

---

# Production Architecture

```text
React

↓

API Gateway

↓

NestJS API

↓

SQS

↓

ECS Workers

↓

S3

↓

CloudFront
```

Benefits:

* Horizontal scaling
* Isolated processing
* Better fault tolerance
* Reduced memory pressure
* Unlimited storage growth

---

# Summary

This design intentionally prioritizes:

1. Simplicity
2. Resource efficiency
3. Reliability
4. Maintainability
5. Clear engineering trade-offs

The system is designed to operate within the provided ECS Fargate constraints while remaining easy to extend toward a production-grade architecture in the future.
