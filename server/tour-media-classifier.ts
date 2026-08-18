/**
 * Classifies a single uploaded media file (photo or video) for the guided
 * room-capture -> virtual tour pipeline.
 *
 * Four possible kinds:
 *  - equirect_photo   : already a 360 photo (e.g. Ricoh Theta / Insta360 export)
 *  - equirect_video    : already a 360 video
 *  - photo             : a regular (non-360) photo, part of a multi-photo room sweep
 *  - walkthrough_video : a regular (non-360) video, e.g. a phone panned around a room
 *
 * Classification is heuristic (aspect ratio + resolution), which is enough to
 * route media into the right processing branch without requiring any
 * external service. It intentionally does NOT attempt to verify the file is
 * genuinely spherical content beyond the aspect-ratio/resolution signal --
 * a mis-classified file just produces a lower-quality tour, it never
 * crashes the pipeline.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type MediaKind = 'equirect_photo' | 'equirect_video' | 'photo' | 'walkthrough_video';

export interface ClassificationResult {
  kind: MediaKind;
  width: number;
  height: number;
  durationSec?: number;
  aspectRatio: number;
  reason: string;
}

const EQUIRECT_MIN_RATIO = 1.9;
const EQUIRECT_MAX_RATIO = 2.15;
const EQUIRECT_MIN_WIDTH_PHOTO = 3000;
const EQUIRECT_MIN_WIDTH_VIDEO = 1920; // some 360 cameras export smaller preview-quality video

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.webm']);

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function probeVideo(filePath: string): Promise<{ width: number; height: number; durationSec: number }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    filePath,
  ]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  const width = Number(stream.width) || 0;
  const height = Number(stream.height) || 0;
  const durationSec = Number(parsed.format?.duration) || 0;
  return { width, height, durationSec };
}

export async function classifyMedia(filePath: string): Promise<ClassificationResult> {
  if (isImageFile(filePath)) {
    const meta = await sharp(filePath).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const ratio = height > 0 ? width / height : 0;
    const isEquirect = ratio >= EQUIRECT_MIN_RATIO && ratio <= EQUIRECT_MAX_RATIO && width >= EQUIRECT_MIN_WIDTH_PHOTO;
    return {
      kind: isEquirect ? 'equirect_photo' : 'photo',
      width,
      height,
      aspectRatio: ratio,
      reason: isEquirect
        ? `~${ratio.toFixed(2)}:1 aspect ratio at ${width}px wide matches an equirectangular 360 photo`
        : `${ratio.toFixed(2)}:1 aspect ratio is a standard (non-360) photo`,
    };
  }

  if (isVideoFile(filePath)) {
    const { width, height, durationSec } = await probeVideo(filePath);
    const ratio = height > 0 ? width / height : 0;
    const isEquirect = ratio >= EQUIRECT_MIN_RATIO && ratio <= EQUIRECT_MAX_RATIO && width >= EQUIRECT_MIN_WIDTH_VIDEO;
    return {
      kind: isEquirect ? 'equirect_video' : 'walkthrough_video',
      width,
      height,
      durationSec,
      aspectRatio: ratio,
      reason: isEquirect
        ? `~${ratio.toFixed(2)}:1 video at ${width}px wide matches an equirectangular 360 video`
        : `${ratio.toFixed(2)}:1 video is a standard (non-360) walkthrough recording`,
    };
  }

  throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
}

/** Quick file-existence + non-empty guard used before classification. */
export function assertReadableFile(filePath: string): void {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('Uploaded file is empty or unreadable');
  }
}
