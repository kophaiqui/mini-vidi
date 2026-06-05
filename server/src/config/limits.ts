/**
 * Hard limits that protect the container running on 0.5 vCPU / 1 GB RAM.
 * Anything exceeding these is rejected at the API boundary before any
 * ffmpeg/yt-dlp process is spawned.
 */
export const LIMITS = {
  MAX_VIDEO_DURATION: 10 * 60, // seconds of source video we accept
  MAX_CLIPS: 10, // segments per export
  MAX_TOTAL_OUTPUT_DURATION: 5 * 60, // summed clip duration
  MAX_TRANSITION_DURATION: 2, // fade length in seconds
  MAX_HEIGHT: 720, // cap resolution to keep CPU/disk sane
};
