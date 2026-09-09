import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { nanoid } from 'nanoid';
import { uploadFileToS3, getS3FileUrl } from './s3-util';
import { uploadTourToCloudinary } from './cloudinary-util';
// @ts-ignore
// import { uploadTourDirToFTP } from "./ftp-upload";
// Dynamically import CommonJS tour-progress-manager for ESM compatibility
// @ts-ignore
let createJob: any, sendProgress: any, addListener: any;
(async () => {
  const progressManager = await import('./tour-progress-manager');
  createJob = progressManager.createJob;
  sendProgress = progressManager.sendProgress;
  addListener = progressManager.addListener;
})();

// Create necessary directories if they don't exist
const uploadDir = path.join(process.cwd(), 'uploads');
const imageDir = path.join(uploadDir, 'images');
const tourDir = path.join(uploadDir, 'tours');

// Create directories if they don't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir);
}
if (!fs.existsSync(tourDir)) {
  fs.mkdirSync(tourDir);
}

// Use memory storage to keep the file as a buffer
const imageStorage = multer.memoryStorage();

// Multer configuration for property images
const multerUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image file.') as any);
    }
  }
});

// Middleware to upload property image to S3
const s3UploadMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(); // No file to upload, proceed to next middleware
  }

  try {
    const file = req.file;
    const uniqueId = nanoid(16);
    const extension = path.extname(file.originalname);
    const key = `images/${uniqueId}${extension}`;

    // Upload to S3
    await uploadFileToS3(key, file.buffer, file.mimetype);

    // Get S3 URL
    const s3Url = getS3FileUrl(key);

    // Attach S3 URL to the file object for downstream use
    (req.file as any).s3Url = s3Url;

    next();
  } catch (error) {
    console.error('S3 upload error:', error);
    next(error);
  }
};

// Chain multer middleware with S3 upload middleware
export const uploadPropertyImage = (req: Request, res: Response, next: NextFunction) => {
  const uploader = multerUpload.single('image');
  uploader(req, res, (err: any) => {
    if (err) {
      return next(err);
    }
    // After multer has processed the file, call the S3 upload middleware
    s3UploadMiddleware(req, res, next);
  });
};

// --- Virtual Tour Upload ---
//
// There used to be two upload paths here: this one relayed the whole ZIP
// through our own Node server (disk-backed multer) before re-uploading it
// to S3 file by file, and a second one PUT the ZIP straight to S3 from the
// browser. The direct-to-S3 path was strictly better on every axis that
// matters for a multi-GB file over a real-world connection - faster (no
// extra hop through our server's own upload/download bandwidth), more
// resilient (per-part retries instead of restarting a failed transfer from
// zero), and it doesn't tie up this server's disk/CPU/memory for the
// transfer itself - so the relay path was removed rather than kept as a
// second thing to maintain. Everything below is that one remaining path.

// Matches the 5GB ceiling already enforced client-side today (see
// DirectS3TourUpload.tsx's own `5 * 1024 * 1024 * 1024` check). The
// presigned-multipart path below bypasses our own multer middleware
// entirely - there's no server-side multer `limits.fileSize` to fall back
// on for it - so this is the ONLY server-side enforcement of that limit.
const MAX_TOUR_ZIP_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

// --- Direct-to-S3 Virtual Tour Upload: Step 1, start a multipart upload ---
//
// Splits the ZIP into parts and presigns each one separately (see
// createStagingMultipartUpload's own doc comment for why multipart beats a
// single PUT for both speed and resilience) so the browser can PUT them to
// S3 directly and in parallel - cutting our server out of the (slow,
// large) transfer itself entirely. completeTourZipMultipartUpload and
// processTourFromS3 below pick the ZIP up from there once every part has
// landed.
export const presignTourZipUpload = async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.propertyId;
    const { fileSizeBytes, contentType } = req.body || {};

    if (typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      return res.status(400).json({ error: 'fileSizeBytes is required' });
    }
    if (fileSizeBytes > MAX_TOUR_ZIP_BYTES) {
      return res.status(400).json({ error: 'File exceeds the 5GB tour upload limit' });
    }

    // A random, unguessable key under staging-tours/ - this object is NOT
    // covered by the bucket's public-read policy (that policy only makes
    // the FINAL, extracted tour files public; see s3-tour-hosting.ts), so
    // there's no meaningful downside to it being guessable either, but
    // nanoid keeps two concurrent uploads for the same property from ever
    // colliding on the same key.
    const s3Key = `staging-tours/property_${propertyId}/${nanoid()}.zip`;
    const expiresInSeconds = 60 * 60; // 1 hour - comfortably long enough for a large, slow upload to start and finish

    const { createStagingMultipartUpload } = await import('./s3-tour-hosting');
    const { uploadId, partSize, parts } = await createStagingMultipartUpload(
      s3Key,
      typeof contentType === 'string' && contentType ? contentType : 'application/zip',
      fileSizeBytes,
      expiresInSeconds
    );

    res.status(200).json({ s3Key, uploadId, partSize, parts, expiresInSeconds });
  } catch (e: any) {
    console.error('[upload] presignTourZipUpload failed:', e);
    res.status(500).json({ error: e.message });
  }
};

// --- Direct-to-S3 Virtual Tour Upload: Step 2, complete the multipart upload ---
//
// Called once every part from step 1 has PUT successfully. Finalizing a
// multipart upload requires calling S3 with our own credentials (it's not
// something a presigned URL alone can do, since the part ETags aren't
// known until each part's PUT actually completes), so this is a real
// server call, not another presign.
export const completeTourZipMultipartUpload = async (req: Request, res: Response) => {
  const { s3Key, uploadId, parts } = req.body || {};

  if (!s3Key || typeof s3Key !== 'string' || !uploadId || typeof uploadId !== 'string' || !Array.isArray(parts)) {
    return res.status(400).json({ error: 's3Key, uploadId, and parts are required' });
  }

  try {
    const { completeStagingMultipartUpload } = await import('./s3-tour-hosting');
    await completeStagingMultipartUpload(s3Key, uploadId, parts);
    res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('[upload] completeTourZipMultipartUpload failed:', e);
    // Best-effort: an upload that can't be completed is dead either way,
    // so free up the uploaded parts rather than leaving them billed
    // indefinitely. Never let this secondary failure mask the real error.
    try {
      const { abortStagingMultipartUpload } = await import('./s3-tour-hosting');
      await abortStagingMultipartUpload(s3Key, uploadId);
    } catch (abortErr) {
      console.error('[upload] failed to abort multipart upload after completion failure (non-fatal):', abortErr);
    }
    res.status(500).json({ error: e.message });
  }
};

// --- Direct-to-S3 Virtual Tour Upload: Step 2, process the staged ZIP ---
//
// Called once the browser's presigned PUT (above) has finished landing the
// ZIP in staging-tours/. From here the flow rejoins the existing pattern
// exactly: respond immediately with a jobId, then do the real work in a
// fire-and-forget async IIFE that reports progress through the SAME
// tour-progress-manager job registry uploadVirtualTour uses above, so the
// existing GET /api/upload/virtual-tour/progress/:jobId SSE endpoint works
// for this path unchanged - the client just needs the jobId this returns.
export const processTourFromS3 = (req: Request, res: Response) => {
  const propertyId = req.params.propertyId;
  const { s3Key } = req.body || {};

  if (!s3Key || typeof s3Key !== 'string') {
    return res.status(400).json({ error: 's3Key is required' });
  }

  const jobId = createJob();
  res.status(200).json({ jobId }); // Respond immediately with jobId

  (async () => {
    const localZipPath = path.join(tourDir, `staging_${nanoid(8)}.zip`);
    try {
      sendProgress(jobId, { progress: 2, message: 'Downloading ZIP from S3...' });

      const { downloadFromS3ToFile, deleteFromS3, uploadTourToS3 } = await import('./s3-tour-hosting');
      await downloadFromS3ToFile(s3Key, localZipPath);

      sendProgress(jobId, { progress: 5, message: 'Download complete, extracting ZIP...' });

      const extractDir = path.join(tourDir, `property_${propertyId}_tour`);
      // Uses tour-zip-extract.ts's zip-slip guard - see that file's own
      // doc comment for why this check has exactly one implementation.
      const { extractTourZip } = await import('./tour-zip-extract');
      extractTourZip(localZipPath, extractDir, ({ extracted, total }) => {
        // Extraction is roughly 5-30% here (0-5% went to the S3 download above).
        const extractionProgress = Math.round(5 + (extracted / total) * 25);
        sendProgress(jobId, {
          progress: extractionProgress,
          message: `Extracting ZIP (${extracted}/${total})...`,
        });
      });

      sendProgress(jobId, { progress: 40, message: 'Uploading files to AWS S3...' });

      const tourUrl = await uploadTourToS3(extractDir, propertyId, (uploadProgress) => {
        // Map upload progress (0-1) to 40-95%.
        sendProgress(jobId, {
          progress: Math.floor(40 + (uploadProgress * 55)),
          message: 'Uploading virtual tour files...'
        });
      });

      sendProgress(jobId, { progress: 97, message: 'Finalizing upload...' });

      // Best-effort: the staging ZIP has already done its job (extracted
      // and re-uploaded as the real hosted tour above) - a failure to
      // delete it just leaves one orphaned object under staging-tours/,
      // never a broken tour, so this must never fail the overall upload.
      try {
        await deleteFromS3(s3Key);
      } catch (cleanupErr) {
        console.error('[upload] failed to delete staging ZIP from S3 (non-fatal):', cleanupErr);
      }

      const { storage } = await import('./storage');
      await storage.updateProperty(parseInt(propertyId), { hasTour: true, tourUrl });

      // Best-effort: let the AI look at a few of the tour's own photos and
      // add what it sees to the listing description - which is also
      // exactly what feeds this property's page title, meta description,
      // and JSON-LD (see shared/seo.ts). Wrapped in its own try/catch,
      // separate from gene/tour-vision.ts's internal one: that module's
      // own try/catch can't protect against the `import()` line itself
      // throwing (e.g. sharp's native binary failing to load on this
      // deploy platform/architecture), and since this sits inside the
      // upload's own try/catch, a throw here would report the ENTIRE
      // upload as failed even though the tour itself was already fully
      // extracted, hosted on S3, and saved to the property record above.
      // A richer description is a nice-to-have; it must never take the
      // actual upload down with it.
      try {
        sendProgress(jobId, { progress: 98, message: 'Reading tour photos for a richer description...' });
        const { enrichPropertyDescriptionFromTour } = await import('./gene/tour-vision');
        await enrichPropertyDescriptionFromTour(parseInt(propertyId), extractDir);
      } catch (visionErr) {
        console.error('[upload] tour-vision enrichment failed (non-fatal, upload still succeeded):', visionErr);
      }

      try {
        fs.unlinkSync(localZipPath);
      } catch (unlinkErr) {
        console.error('[upload] failed to remove local staging ZIP copy (non-fatal):', unlinkErr);
      }

      sendProgress(jobId, { progress: 100, message: 'Upload complete!', done: true, tourUrl });
    } catch (e: any) {
      sendProgress(jobId, { error: e.message, done: true });
      try {
        if (fs.existsSync(localZipPath)) fs.unlinkSync(localZipPath);
      } catch {
        // Best-effort cleanup only - the upload has already failed for a
        // real reason above; a leftover temp file isn't worth reporting.
      }
    }
  })();
};

// --- SSE Progress Endpoint ---
export const sseTourProgress = (req: Request, res: Response) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const { jobId } = req.params;
  const ok = addListener(jobId, res);
  if (!ok) {
    res.write(`data: ${JSON.stringify({ error: 'Invalid jobId' })}\n\n`);
    res.end();
    return;
  }

  // Keep-alive ping every 15s. Without this, a large tour with a slow file
  // (S3's own request can now take up to ~60s per attempt before timing
  // out and retrying - see s3-tour-hosting.ts) leaves this connection
  // completely silent for that whole stretch, since sendProgress() is
  // only called between files. Most reverse proxies and hosting platforms
  // kill an idle HTTP connection well before that (30-60s is typical).
  // When that happens, the browser's EventSource silently reconnects -
  // addListener() above replays only the *last known* progress, so the
  // UI shows the same percentage forever even though the upload is still
  // working underneath. A ": " comment line is invisible to EventSource's
  // onmessage handler (SSE ignores comment lines) but keeps bytes
  // flowing so the connection - and the illusion of a live progress bar -
  // survives however long the current file actually takes.
  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
  res.on('finish', () => {
    clearInterval(heartbeat);
  });
};

// Register routes (add to your Express app)
export function registerTourUploadRoutes(app: express.Application) {
  app.post('/api/upload/virtual-tour/:propertyId/presign-zip', presignTourZipUpload);
  app.post('/api/upload/virtual-tour/:propertyId/complete-multipart', completeTourZipMultipartUpload);
  app.post('/api/upload/virtual-tour/:propertyId/process-from-s3', processTourFromS3);
  app.get('/api/upload/virtual-tour/progress/:jobId', sseTourProgress);
}

// Helper functions for file operations
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Middleware to handle upload errors
export function handleUploadErrors(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message });
  }

  next();
}

// Configure routes to serve uploaded files
export function setupStaticFileRoutes(app: any) {
  // Serve property images
  app.use('/uploads/images', (req: Request, res: Response, next: NextFunction) => {
    // Set cache headers for images
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    next();
  }, express.static(imageDir));

  // Serve virtual tours
  app.use('/uploads/tours', (req: Request, res: Response, next: NextFunction) => {
    // Set cache headers for tour files
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    next();
  }, express.static(tourDir));
}