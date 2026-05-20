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
 * Run ffmpeg to encode the frame sequence into a playable MP4.
 *
 * Args breakdown:
 *   -framerate <rate>         expected input frame rate
 *   -i frame_%08d.jpg         glob of JPEG inputs
 *   -c:v libx264              widely-supported H.264 encoder
 *   -pix_fmt yuv420p          required for QuickTime / browser playback
 *   -movflags +faststart      enables streaming (metadata at file head)
 *   -preset veryfast          balance speed vs. file size; iteration friendly
 *   -crf 20                   visually transparent quality (good for code text)
 *   -y                        overwrite output without prompting
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
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    ...(hasAudio
      ? [
          '-c:a',
          'aac',
          '-b:a',
          '160k',
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
