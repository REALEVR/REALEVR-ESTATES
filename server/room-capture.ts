/**
 * Guided room-capture upload pipeline: lets an agent upload plain photos
 * or a video per room (instead of a pre-built 3D Vista/Pano2VR tour ZIP)
 * and turns them into a self-hosted virtual tour.
 *
 * This is a NEW, additive path alongside the existing uploadVirtualTour
 * (server/upload.ts) -- that ZIP-upload flow is completely untouched, and
 * agents with professional tour software keep using it as-is.
 *
 * Flow:
 *   1. POST /api/upload/room-capture/:propertyId          (repeatable, once per room)
 *   2. GET  /api/upload/room-capture/:propertyId/manifest  (resume / progress UI)
 *   3. DELETE /api/upload/room-capture/:propertyId/:roomSlug  (retake a room)
 *   4. POST /api/upload/room-capture/:propertyId/finalize  (assemble + publish, SSE progress
 *      reuses the existing GET /api/upload/virtual-tour/progress/:jobId endpoint)
 */
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import {
  classifyMedia,
  isImageFile,
  isVideoFile,
  assertReadableFile,
} from './tour-media-classifier';
import { scoreImageQuality, qualityFailureReasons } from './tour-quality-checks';
import { extractCandidateFrames, pickPrimaryFrame, probeVideoDuration } from './video-frame-extractor';
import { generateTourFromManifest } from './tour-generator';
import {
  DraftManifest,
  RoomEntry,
  RoomCaptureKind,
  slugifyRoomName,
  MIN_QUALIFYING_ROOMS_DEFAULT,
} from './room-capture-types';

const uploadsRoot = path.join(process.cwd(), 'uploads', 'tours');

const MIN_SWEEP_PHOTOS = 6;
const MIN_VIDEO_DURATION_SEC = 5;
const MAX_SWEEP_PHOTOS_FROM_VIDEO = 10;

function draftDirFor(propertyId: string): string {
  return path.join(uploadsRoot, `property_${propertyId}_draft`);
}

function manifestPathFor(propertyId: string): string {
  return path.join(draftDirFor(propertyId), 'manifest.json');
}

function loadManifest(propertyId: string): DraftManifest {
  const manifestPath = manifestPathFor(propertyId);
  if (!fs.existsSync(manifestPath)) {
    const fresh: DraftManifest = {
      propertyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rooms: [],
    };
    return fresh;
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function saveManifest(propertyId: string, manifest: DraftManifest): void {
  fs.mkdirSync(draftDirFor(propertyId), { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPathFor(propertyId), JSON.stringify(manifest, null, 2));
}

// Multer: buffer uploads in memory, we write them out ourselves once we
// know the room slug (keeps temp files scoped and easy to clean up).
const roomCaptureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024, files: 21 }, // videos can be large; 20 photos + 1 video max
}).fields([
  { name: 'photos', maxCount: 20 },
  { name: 'video', maxCount: 1 },
]);

interface ProcessedAsset {
  relPath: string;
}

async function processPhotoSet(
  photoFiles: Express.Multer.File[],
  roomTmpDir: string,
  roomFinalDir: string,
  draftDir: string
): Promise<{ kind: RoomCaptureKind; assets: ProcessedAsset[]; warnings: string[]; rejectionReasons: string[] }> {
  const warnings: string[] = [];
  const rejectionReasons: string[] = [];

  // Write buffers to temp files so sharp/ffprobe can read them by path.
  const tmpPaths: string[] = [];
  photoFiles.forEach((f, i) => {
    const tmpPath = path.join(roomTmpDir, `in_${i}${path.extname(f.originalname) || '.jpg'}`);
    fs.writeFileSync(tmpPath, f.buffer);
    tmpPaths.push(tmpPath);
  });

  // Classify every photo; if exactly one is an already-equirectangular
  // 360 photo, prefer it and ignore the rest (agent used a 360 camera).
  const classifications = await Promise.all(tmpPaths.map((p) => classifyMedia(p)));
  const equirectIdx = classifications.findIndex((c) => c.kind === 'equirect_photo');

  if (equirectIdx !== -1) {
    fs.mkdirSync(roomFinalDir, { recursive: true });
    const destPath = path.join(roomFinalDir, 'source_360.jpg');
    fs.copyFileSync(tmpPaths[equirectIdx], destPath);
    if (tmpPaths.length > 1) {
      warnings.push(`Found a 360 photo among ${tmpPaths.length} uploads -- used it directly and ignored the other ${tmpPaths.length - 1} photo(s).`);
    }
    return {
      kind: 'equirect_photo',
      assets: [{ relPath: path.relative(draftDir, destPath) }],
      warnings,
      rejectionReasons,
    };
  }

  // Otherwise treat as a multi-photo sweep: quality-check each, keep the
  // good ones, require a minimum surviving count.
  const accepted: ProcessedAsset[] = [];
  fs.mkdirSync(roomFinalDir, { recursive: true });
  for (let i = 0; i < tmpPaths.length; i++) {
    const quality = await scoreImageQuality(tmpPaths[i]);
    const failReasons = qualityFailureReasons(quality);
    if (failReasons.length > 0) {
      rejectionReasons.push(`Photo ${i + 1}: ${failReasons.join(' ')}`);
      continue;
    }
    const destPath = path.join(roomFinalDir, `photo_${String(accepted.length + 1).padStart(2, '0')}.jpg`);
    fs.copyFileSync(tmpPaths[i], destPath);
    accepted.push({ relPath: path.relative(draftDir, destPath) });
  }

  if (accepted.length < MIN_SWEEP_PHOTOS) {
    rejectionReasons.unshift(
      `Only ${accepted.length} usable photo(s) after quality checks -- need at least ${MIN_SWEEP_PHOTOS} covering the whole room. Retake the flagged angles and add more photos rotating evenly around the room.`
    );
  }

  return { kind: 'photo_sweep', assets: accepted, warnings, rejectionReasons };
}

async function processVideo(
  videoFile: Express.Multer.File,
  roomTmpDir: string,
  roomFinalDir: string,
  draftDir: string
): Promise<{ kind: RoomCaptureKind; assets: ProcessedAsset[]; warnings: string[]; rejectionReasons: string[] }> {
  const warnings: string[] = [];
  const rejectionReasons: string[] = [];

  const tmpVideoPath = path.join(roomTmpDir, `video${path.extname(videoFile.originalname) || '.mp4'}`);
  fs.writeFileSync(tmpVideoPath, videoFile.buffer);
  assertReadableFile(tmpVideoPath);

  const classification = await classifyMedia(tmpVideoPath);
  // classifyMedia's video branch only ever returns 'equirect_video' | 'walkthrough_video';
  // narrow explicitly so this function's return type lines up with RoomCaptureKind.
  const videoKind = classification.kind as 'equirect_video' | 'walkthrough_video';
  const duration = classification.durationSec ?? (await probeVideoDuration(tmpVideoPath));

  if (duration < MIN_VIDEO_DURATION_SEC) {
    rejectionReasons.push(
      `Video is only ${duration.toFixed(1)}s long -- record at least ${MIN_VIDEO_DURATION_SEC}s, slowly rotating a full 360° around the room.`
    );
    return { kind: videoKind, assets: [], warnings, rejectionReasons };
  }

  const framesDir = path.join(roomTmpDir, 'frames');
  const frames = await extractCandidateFrames(tmpVideoPath, framesDir, { intervalSec: 2, maxFrames: 24 });

  if (frames.length === 0) {
    rejectionReasons.push('Could not extract any frames from this video -- try re-recording or upload photos instead.');
    return { kind: videoKind, assets: [], warnings, rejectionReasons };
  }

  fs.mkdirSync(roomFinalDir, { recursive: true });

  if (videoKind === 'equirect_video') {
    const primary = pickPrimaryFrame(frames);
    if (!primary) {
      rejectionReasons.push('Every extracted frame was too blurry to use -- hold the camera steadier and re-record.');
      return { kind: videoKind, assets: [], warnings, rejectionReasons };
    }
    const destPath = path.join(roomFinalDir, 'source_360.jpg');
    fs.copyFileSync(primary.path, destPath);
    return { kind: videoKind, assets: [{ relPath: path.relative(draftDir, destPath) }], warnings, rejectionReasons };
  }

  // Regular walkthrough video: keep the sharpest N frames as a "photo
  // sweep" gallery, same acceptance threshold as directly-uploaded photos.
  const best = frames.slice(0, MAX_SWEEP_PHOTOS_FROM_VIDEO);
  const accepted: ProcessedAsset[] = [];
  for (const frame of best) {
    const quality = await scoreImageQuality(frame.path);
    if (qualityFailureReasons(quality).length > 0) continue;
    const destPath = path.join(roomFinalDir, `photo_${String(accepted.length + 1).padStart(2, '0')}.jpg`);
    fs.copyFileSync(frame.path, destPath);
    accepted.push({ relPath: path.relative(draftDir, destPath) });
  }

  if (accepted.length < MIN_SWEEP_PHOTOS) {
    rejectionReasons.unshift(
      `Only ${accepted.length} sharp frame(s) could be extracted from this video -- record more slowly and make sure the room is well-lit, covering a full 360° turn.`
    );
  }

  return { kind: videoKind, assets: accepted, warnings, rejectionReasons };
}

export const uploadRoomCapture = (req: Request, res: Response, next: NextFunction) => {
  roomCaptureUpload(req, res, async (err: any) => {
    if (err) return next(err);

    const propertyId = req.params.propertyId;
    const roomName = (req.body?.roomName || '').toString().trim();
    if (!propertyId) return res.status(400).json({ status: 'error', message: 'Invalid property ID' });
    if (!roomName) return res.status(400).json({ status: 'error', message: 'roomName is required' });

    const files = req.files as { photos?: Express.Multer.File[]; video?: Express.Multer.File[] } | undefined;
    const photoFiles = (files?.photos ?? []).filter((f) => isImageFile(f.originalname));
    const videoFile = (files?.video ?? []).find((f) => isVideoFile(f.originalname));

    if (photoFiles.length === 0 && !videoFile) {
      return res.status(400).json({ status: 'error', message: 'Upload at least one photo or one video for this room' });
    }

    const draftDir = draftDirFor(propertyId);
    const slug = slugifyRoomName(roomName);
    const roomTmpDir = path.join(draftDir, '_tmp', `${slug}-${nanoid(6)}`);
    const roomFinalDir = path.join(draftDir, 'rooms', slug);

    fs.mkdirSync(roomTmpDir, { recursive: true });

    try {
      // Clear any previous attempt for this room (this call IS the retake).
      if (fs.existsSync(roomFinalDir)) fs.rmSync(roomFinalDir, { recursive: true, force: true });

      const result = videoFile
        ? await processVideo(videoFile, roomTmpDir, roomFinalDir, draftDir)
        : await processPhotoSet(photoFiles, roomTmpDir, roomFinalDir, draftDir);

      const manifest = loadManifest(propertyId);
      const entry: RoomEntry = {
        slug,
        name: roomName,
        kind: result.kind,
        status: result.assets.length > 0 && result.rejectionReasons.length === 0 ? 'qualified' : 'needs_retake',
        assets: result.assets,
        warnings: result.warnings,
        rejectionReasons: result.rejectionReasons,
        updatedAt: new Date().toISOString(),
      };
      manifest.rooms = manifest.rooms.filter((r) => r.slug !== slug);
      manifest.rooms.push(entry);
      saveManifest(propertyId, manifest);

      return res.json({
        status: entry.status === 'qualified' ? 'success' : 'needs_retake',
        room: entry,
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    } finally {
      fs.rmSync(roomTmpDir, { recursive: true, force: true });
    }
  });
};

export const getRoomCaptureManifest = (req: Request, res: Response) => {
  const propertyId = req.params.propertyId;
  const manifest = loadManifest(propertyId);
  res.json(manifest);
};

export const deleteRoomCapture = (req: Request, res: Response) => {
  const { propertyId, roomSlug } = req.params;
  const manifest = loadManifest(propertyId);
  manifest.rooms = manifest.rooms.filter((r) => r.slug !== roomSlug);
  saveManifest(propertyId, manifest);
  const roomFinalDir = path.join(draftDirFor(propertyId), 'rooms', roomSlug);
  fs.rmSync(roomFinalDir, { recursive: true, force: true });
  res.json({ status: 'success' });
};

export const finalizeRoomCapture = (req: Request, res: Response) => {
  (async () => {
    const propertyId = req.params.propertyId;
    const manifest = loadManifest(propertyId);
    const qualified = manifest.rooms.filter((r) => r.status === 'qualified');

    if (qualified.length < MIN_QUALIFYING_ROOMS_DEFAULT) {
      return res.status(400).json({
        status: 'error',
        message: `Need at least ${MIN_QUALIFYING_ROOMS_DEFAULT} qualified room(s) before building a tour -- currently ${qualified.length}.`,
      });
    }

    // @ts-ignore -- tour-progress-manager.js has no declaration file (same as server/upload.ts's use of it)
    const { createJob, sendProgress } = await import('./tour-progress-manager');
    const jobId = createJob();
    res.json({ jobId });

    try {
      const { storage } = await import('./storage');
      const property = await storage.getProperty(parseInt(propertyId));
      const propertyTitle = property?.title || `Property ${propertyId}`;

      sendProgress(jobId, { progress: 10, message: 'Preparing captured rooms...' });

      const draftDir = draftDirFor(propertyId);
      const extractDir = path.join(uploadsRoot, `property_${propertyId}_tour`);
      const { tourJson } = await generateTourFromManifest(manifest, draftDir, extractDir, propertyTitle);

      sendProgress(jobId, { progress: 40, message: `Built ${tourJson.rooms.length} room scene(s), uploading to AWS S3...` });

      const { uploadTourToS3 } = await import('./s3-tour-hosting');
      const tourUrl = await uploadTourToS3(extractDir, propertyId, (uploadProgress) => {
        sendProgress(jobId, { progress: Math.floor(40 + uploadProgress * 55), message: 'Uploading virtual tour files...' });
      });

      const allPanorama = tourJson.rooms.every((r) => r.mode === 'panorama');
      const tourQuality = allPanorama ? 'equirect_360' : 'photo_sweep_lite';

      await storage.updateProperty(parseInt(propertyId), { hasTour: true, tourUrl, tourQuality });

      // Draft has been published -- clear it so a future capture session starts fresh.
      fs.rmSync(draftDir, { recursive: true, force: true });

      sendProgress(jobId, { progress: 100, message: 'Virtual tour published!', done: true, tourUrl });
    } catch (e: any) {
      sendProgress(jobId, { error: e.message, done: true });
    }
  })();
};

export function registerRoomCaptureRoutes(app: express.Application, guard: express.RequestHandler) {
  app.post('/api/upload/room-capture/:propertyId', guard, uploadRoomCapture);
  app.get('/api/upload/room-capture/:propertyId/manifest', guard, getRoomCaptureManifest);
  app.delete('/api/upload/room-capture/:propertyId/:roomSlug', guard, deleteRoomCapture);
  app.post('/api/upload/room-capture/:propertyId/finalize', guard, finalizeRoomCapture);
}
