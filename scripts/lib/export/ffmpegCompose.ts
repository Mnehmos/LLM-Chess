/**
 * Compose a frame sequence + (optional) narration audio into an MP4
 * via ffmpeg-static.
 *
 * Phase 3 shipped silent MP4s; Phase 3.1 adds audio mux. The SPA's
 * AudioNarrationQueue taps a MediaRecorder onto its gain node in
 * broadcast mode, base64-encodes the result onto the export bridge,
 * and the orchestrator writes that webm/opus blob to disk before
 * calling here. ffmpeg re-encodes to AAC for MP4 compatibility.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { registerPid } from './processRegistry';

export interface ComposeOptions {
  /** Absolute path to a directory containing frame_00000000.jpg, frame_00000001.jpg, … */
  frameDir: string;
  /** Frame rate matching the writer's output (typically 30). */
  frameRate: number;
  /** Absolute output path for the .mp4 file. */
  outputPath: string;
  /** Absolute path to the ffmpeg binary. */
  ffmpegPath: string;
  /**
   * Optional path to an audio file (webm/opus from MediaRecorder, or
   * any ffmpeg-decodable container) to mux into the MP4. When set,
   * the audio is re-encoded to AAC and the output uses `-shortest` so
   * the MP4 ends with whichever stream finishes first.
   */
  audioPath?: string;
}

/**
 * Upload-grade H.264 encoder args, shared between the compose pass and
 * the dead-air re-encode.
 *
 * History:
 *   v1 (PR #59): -b:v 8M -maxrate 10M -bufsize 16M with -tune stillimage
 *                Produced ~500 kb/s in practice — the `stillimage` tune
 *                tells x264 the source is screenshot-grade and triggers
 *                hyper-aggressive psy-rd / aq settings, causing ABR
 *                mode to massively undershoot the 8 Mbps target.
 *
 *   v2 (this):   -crf 16 with VBV ceiling, no tune.
 *                CRF mode targets visual quality directly. CRF 16 is
 *                "visually transparent" — x264 produces whatever
 *                bitrate is needed to maintain that fidelity. For
 *                1080p text-heavy chess content this typically lands
 *                in the 3-6 Mbps range — high enough to survive
 *                YouTube re-encoding without smearing.
 *
 * Settings:
 *   -crf 16              visually transparent quality target
 *   -maxrate 12M         VBV ceiling — won't peak above this
 *   -bufsize 24M         2x maxrate buffer for steady decoding
 *   -preset slow         better compression efficiency at the
 *                        same quality (trades encode time)
 *   -profile:v high -level 4.1   standard 1080p H.264 profile
 *   -pix_fmt yuv420p     QuickTime / browser compat
 *   -movflags +faststart metadata at file head for streaming
 *
 * No -tune. The board has enough motion (caption updates, eval bar
 * shifts, recent-moves panel changes, fun-fact rotation) that
 * `stillimage` is the wrong assumption. `animation` would also work
 * (sparse-color, sharp edges) but the default psy settings produce
 * crisp text reliably.
 */
const VIDEO_ENCODE_ARGS = [
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-profile:v', 'high',
  '-level', '4.1',
  '-pix_fmt', 'yuv420p',
  '-crf', '16',
  '-maxrate', '12M',
  '-bufsize', '24M',
  '-movflags', '+faststart',
];

/**
 * AAC audio encoder args. 192 kbps stereo is the upper end of what
 * YouTube accepts without re-encoding for AAC sources — keeps the
 * narration crisp through the re-transcode.
 */
const AUDIO_ENCODE_ARGS = [
  '-c:a', 'aac',
  '-b:a', '192k',
  '-ar', '48000',
];

export { VIDEO_ENCODE_ARGS, AUDIO_ENCODE_ARGS };

/**
 * Run ffmpeg to encode the frame sequence into a playable MP4.
 * See VIDEO_ENCODE_ARGS above for the codec settings rationale.
 */
export async function composeMp4(options: ComposeOptions): Promise<void> {
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const hasAudio = Boolean(options.audioPath);
  const args = [
    '-y',
    '-framerate',
    String(options.frameRate),
    '-i',
    path.join(options.frameDir, 'frame_%08d.jpg'),
    ...(hasAudio ? ['-i', options.audioPath as string] : []),
    ...VIDEO_ENCODE_ARGS,
    ...(hasAudio
      ? [
          ...AUDIO_ENCODE_ARGS,
          // Map: video from input 0, audio from input 1.
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          // End at the shorter of the two streams. The audio
          // recorder starts after the video, so the audio is
          // typically slightly shorter; without -shortest the MP4
          // would end with a tail of silent video.
          '-shortest',
        ]
      : []),
    options.outputPath,
  ];
  console.log(`[ffmpeg] composing ${options.outputPath}${hasAudio ? ' (with audio)' : ' (silent)'}`);
  await runFfmpeg(options.ffmpegPath, args);
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (child.pid !== undefined) {
      const unregister = registerPid(child.pid);
      child.once('exit', unregister);
    }
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}\n--- stderr tail ---\n${stderr.slice(-2000)}`));
      }
    });
  });
}
