# UI & Feature Implementation Plan

## 1. Goal

Build a simple but complete video editor flow:

```text
Paste YouTube URL
→ Preview video
→ Select multiple clip ranges
→ Arrange clips in timeline
→ Set transition between clips
→ Export final video
→ Download output
```

The goal is not to build a professional editor, but to demonstrate:

- Product sense
- Clear user flow
- Correct video editing model
- Resource-aware implementation
- Good engineering trade-offs

---

# 2. UI Plan

## 2.1 Main Layout

```text
+--------------------------------------------------+
| Video Editor Mini App                            |
+--------------------------------------------------+

[ YouTube URL input                         ][Load]

----------------------------------------------------

[ Video Preview ]

Current time: 00:35

[ Set Start ] [ Set End ] [ Add Clip ]

Start: 00:10
End:   00:25

----------------------------------------------------

Timeline

[ Clip 1 ] -- Fade -- [ Clip 2 ] -- Cut -- [ Clip 3 ]

----------------------------------------------------

Selected Clips

Clip 1: 00:10 → 00:25    [Move Up] [Move Down] [Delete]
Transition after: Fade

Clip 2: 01:00 → 01:20    [Move Up] [Move Down] [Delete]
Transition after: Cut

Clip 3: 02:10 → 02:30    [Move Up] [Move Down] [Delete]

----------------------------------------------------

[ Export Video ]

Status: Ready / Processing / Done / Failed

[ Download Output ]
```

---

# 3. Core UI Components

## 3.1 YouTube URL Input

### Purpose

Allow user to paste a YouTube URL and import the video.

### UI

```text
[ YouTube URL ][Load Video]
```

### States

```ts
type ImportState = {
  url: string;
  loading: boolean;
  error?: string;
};
```

### Behavior

- Validate empty URL
- Call backend import API
- Show loading state
- Show error if download fails
- Show video preview when ready

---

## 3.2 Video Preview

### Purpose

Allow user to preview and seek the imported video.

### UI

```html
<video controls />
```

### Required Features

- Play / pause
- Seek video
- Read current playback time
- Use current time for clip selection

### Nice-to-have

- Button to jump to clip start
- Button to preview selected range

---

## 3.3 Clip Selector

### Purpose

Allow user to select one or more crop positions from the video.

### UI

```text
Current time: 00:35

[Set Start] [Set End]

Start: 00:10
End:   00:25

[Add Clip]
```

### Behavior

- User seeks video to a position
- Clicks `Set Start`
- Seeks to another position
- Clicks `Set End`
- Clicks `Add Clip`
- Clip is added to timeline

### Validation

Reject clip if:

```text
start >= end
clip duration is too short
clip duration exceeds limit
number of clips exceeds limit
```

---

## 3.4 Timeline View

### Purpose

Show the final output sequence visually.

### UI

```text
[ Clip 1 ] -- Fade -- [ Clip 2 ] -- Cut -- [ Clip 3 ]
```

### Required Features

- Show clips in export order
- Show transition between clips
- Make it clear that final video is built from left to right

### Nice-to-have

- Drag and drop reorder
- Visual duration ratio
- Highlight selected clip

### Simpler Alternative

If drag and drop takes too long, use:

```text
[Move Up] [Move Down]
```

This is easier and safer for a 2-hour case study.

---

## 3.5 Clip List

### Purpose

Allow user to manage selected clips.

### UI

```text
Clip 1
00:10 → 00:25
Transition after: Fade
[Move Up] [Move Down] [Delete]

Clip 2
01:00 → 01:20
Transition after: Cut
[Move Up] [Move Down] [Delete]
```

### Required Features

- Delete clip
- Reorder clip
- Show start and end time
- Show duration
- Set transition after clip

---

## 3.6 Transition Selector

### Important Modeling Decision

Transition belongs to the boundary between two clips, not to the whole video.

Example:

```text
Clip 1 -- Fade -- Clip 2 -- Cut -- Clip 3
```

So the transition should be stored as:

```ts
transitionAfter
```

on each clip except the last one.

### Supported Transitions

```ts
type TransitionType = "cut" | "fade";
```

### Optional Future Transition

```ts
type TransitionType = "cut" | "fade" | "slide";
```

### Recommendation

For the case study:

```text
Implement: Cut, Fade
Document as future work: Slide
```

Reason:

- Cut is simple and fast
- Fade demonstrates transition logic
- Slide requires more complex FFmpeg filter graphs
- Slide may consume more CPU and increase failure risk under 0.5 vCPU

---

# 4. Frontend Data Model

## 4.1 Clip Model

```ts
type Clip = {
  id: string;
  start: number;
  end: number;
  transitionAfter?: TransitionType;
};
```

Example:

```ts
const clips = [
  {
    id: "clip-1",
    start: 10,
    end: 25,
    transitionAfter: "fade",
  },
  {
    id: "clip-2",
    start: 60,
    end: 80,
    transitionAfter: "cut",
  },
  {
    id: "clip-3",
    start: 130,
    end: 150,
  },
];
```

Explanation:

```text
clip-1 connects to clip-2 using fade
clip-2 connects to clip-3 using cut
clip-3 has no transitionAfter because it is the last clip
```

---

## 4.2 App State

```ts
type EditorState = {
  jobId: string | null;
  videoUrl: string | null;
  duration: number | null;

  clips: Clip[];

  currentStart: number | null;
  currentEnd: number | null;

  status:
    | "idle"
    | "importing"
    | "ready"
    | "processing"
    | "done"
    | "failed";

  outputUrl?: string;
  error?: string;
};
```

---

# 5. Backend API Plan

## 5.1 Import Video

```http
POST /api/import
```

Request:

```json
{
  "url": "https://youtube.com/..."
}
```

Response:

```json
{
  "jobId": "job_123",
  "duration": 320,
  "videoUrl": "/api/videos/job_123/source",
  "status": "ready"
}
```

---

## 5.2 Stream Source Video

```http
GET /api/videos/:jobId/source
```

Purpose:

- Stream source video to frontend preview
- Do not load video into memory

Implementation principle:

```ts
createReadStream(filePath).pipe(response);
```

---

## 5.3 Export Video

```http
POST /api/jobs/:jobId/export
```

Request:

```json
{
  "clips": [
    {
      "id": "clip-1",
      "start": 10,
      "end": 25,
      "transitionAfter": "fade"
    },
    {
      "id": "clip-2",
      "start": 60,
      "end": 80,
      "transitionAfter": "cut"
    },
    {
      "id": "clip-3",
      "start": 130,
      "end": 150
    }
  ]
}
```

Response:

```json
{
  "status": "accepted"
}
```

---

## 5.4 Job Status

```http
GET /api/jobs/:jobId
```

Response:

```json
{
  "status": "processing",
  "progress": 60
}
```

---

## 5.5 Download Output

```http
GET /api/jobs/:jobId/download
```

Purpose:

- Stream final output video
- Do not load output file into memory

---

# 6. Video Processing Plan

## 6.1 Cut Clips

For each selected clip:

```bash
ffmpeg -ss START -to END -i source.mp4 -c:v libx264 -preset veryfast -crf 28 -threads 1 clip-001.mp4
```

Output:

```text
clip-001.mp4
clip-002.mp4
clip-003.mp4
```

---

## 6.2 Merge Clips Without Transition

For `cut` transition:

```text
clip-001.mp4 + clip-002.mp4 + clip-003.mp4
```

Use FFmpeg concat.

```bash
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
```

---

## 6.3 Merge Clips With Fade

For `fade`, use FFmpeg filter graph.

Trade-off:

```text
Fade requires re-encoding.
It is slower than cut.
It uses more CPU.
```

Therefore:

```text
Cut = fast path
Fade = enhanced path
Slide = future work
```

---

# 7. Feature Priority

## Must-have

```text
1. User can import YouTube URL
2. User can preview video
3. User can select multiple clip ranges
4. User can see selected clips
5. User can reorder clips
6. User can choose Cut/Fade transition between clips
7. User can export merged output
8. User can download final video
```

---

## Should-have

```text
1. Mini timeline visualization
2. Move Up / Move Down clip order
3. Per-boundary transition selection
4. Clear error messages
5. Export progress/status polling
```

---

## Nice-to-have

```text
1. Drag and drop timeline
2. Slide transition
3. Thumbnail preview
4. Preview selected clip only
5. Preview final output before download
```

---

## Not needed for this case study

```text
1. Authentication
2. Database
3. User accounts
4. Multi-track editing
5. Audio mixing
6. Real-time collaboration
7. Advanced timeline editor
```

---

# 8. Resource Management Notes

## Main Rule

Never load video files into RAM.

Use streams:

```ts
createReadStream(filePath)
```

Avoid:

```ts
readFileSync(filePath)
```

---

## Limits

```ts
const MAX_VIDEO_DURATION = 10 * 60;
const MAX_CLIPS = 10;
const MAX_TOTAL_OUTPUT_DURATION = 5 * 60;
const MAX_TRANSITION_DURATION = 2;
const MAX_CONCURRENT_EXPORTS = 1;
```

---

## Why Only One Export at a Time?

The target environment is:

```text
0.5 vCPU
1GB RAM
```

FFmpeg is CPU-heavy. Running multiple exports in one container can cause:

```text
CPU starvation
slow processing
memory pressure
failed jobs
```

So the app should process one export job at a time.

---

# 9. Recommended Implementation Order

## Step 1

Finish basic clip selector:

```text
Set Start
Set End
Add Clip
Delete Clip
```

---

## Step 2

Add clip reorder:

```text
Move Up
Move Down
```

---

## Step 3

Add mini timeline:

```text
[Clip 1] -- Fade -- [Clip 2] -- Cut -- [Clip 3]
```

---

## Step 4

Add transition per boundary:

```text
Clip 1 transitionAfter = Fade
Clip 2 transitionAfter = Cut
```

---

## Step 5

Update export API payload.

---

## Step 6

Update backend FFmpeg pipeline.

---

## Step 7

Add README explanation.

---

# 10. README Explanation Snippet

```md
## Timeline and Transition Model

The editor models the output as an ordered list of clips. Each clip contains a source time range and an optional transitionAfter field.

This means transitions belong to the boundary between two clips, not to the whole video.

Example:

Clip 1 -- Fade -- Clip 2 -- Cut -- Clip 3

This design keeps the implementation simple while still matching how video editing timelines are typically modeled.

## Trade-off

Only Cut and Fade are implemented. Slide was considered, but not included in the initial version because it requires a more complex FFmpeg filter graph and increases CPU usage. Since the target runtime is limited to 0.5 vCPU and 1GB RAM, the implementation prioritizes stability and predictable processing time.
```

---

# 11. Final Recommendation

For the case study, the best balance is:

```text
Simple video player
+ Set Start/End buttons
+ Clip list
+ Move Up/Down
+ Mini timeline visualization
+ Per-boundary Cut/Fade transition
+ Export and download
```

Do not spend too much time on a fancy drag-and-drop timeline.

A clear, stable, resource-aware implementation with a strong README is more valuable than a complex UI that may break.
