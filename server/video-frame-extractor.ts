/**
 * Extracts still frames from an uploaded room video via ffmpeg, so that
 * both "already-360" videos and regular walkthrough videos can feed the
 * same downstream image pipeline (quality scoring + tour assembly) as
 * directly-uploaded photos.
 *
 * Requires the `ffmpeg` binary on PATH (documented server prerequisite --
 * see docs/GUIDED_360_UPLOAD.md). Falls through with a clear error if it's
 * missing rather than failing silently.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { scoreImageQuality } from './tour-quality-checks';

const execFileAsync = promisify(execFile);

export interface ExtractedFrame {
  path: string;
  timestampSec: number;
  sharpness: number;
}

/**
 * Samples frames at a fixed cadence, scores each for sharpness, and
 * returns them sorted best-first. Caller decides how many to keep.
 */
export async function extractCandidateFrames(
  videoPath: string,
  outDir: string,
  opts: { intervalSec?: number; maxFrames?: number } = {}
): Promise<ExtractedFrame[]> {
  const intervalSec = opts.intervalSec ?? 2;
  const maxFrames = opts.maxFrames ?? 20;

  fs.mkdirSync(outDir, { recursive: true });
  const pattern = path.join(outDir, 'frame_%04d.jpg');

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vf', `fps=1/${intervalSec}`,
      '-frames:v', String(maxFrames),
      '-q:v', '2',
      pattern,
    ]);
  } catch (err: any) {
    throw new Error(`ffmpeg frame extraction failed (is ffmpeg installed on this server?): ${err.message}`);
  }

  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort();

  const frames: ExtractedFrame[] = [];
  for (let i = 0; i < files.length; i++) {
    const framePath = path.join(outDir, files[i]);
    const quality = await scoreImageQuality(framePath);
    frames.push({ path: framePath, timestampSec: i * intervalSec, sharpness: quality.sharpness });
  }

  // Sharpest first so callers can just take(N) the best frames.
  return frames.sort((a, b) => b.sharpness - a.sharpness);
}

/** Picks the single best (sharpest) frame closest to the middle of the clip. */
export function pickPrimaryFrame(frames: ExtractedFrame[]): ExtractedFrame | null {
  if (frames.length === 0) return null;
  const sharpEnough = frames.filter((f) => f.sharpness >= 10);
  const pool = sharpEnough.length > 0 ? sharpEnough : frames;
  const midTimestamp = pool.reduce((sum, f) => sum + f.timestampSec, 0) / pool.length;
  return [...pool].sort((a, b) => Math.abs(a.timestampSec - midTimestamp) - Math.abs(b.timestampSec - midTimestamp))[0];
}

export async function probeVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'json',
    videoPath,
  ]);
  const parsed = JSON.parse(stdout);
  return Number(parsed.format?.duration) || 0;
}
