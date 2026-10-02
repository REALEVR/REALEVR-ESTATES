import { type BucketLocationConstraint, S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand, PutBucketAccelerateConfigurationCommand, GetBucketAccelerateConfigurationCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mime from 'mime-types';
import { getOptimizedConfig, shouldSkipFile, shouldSkipDirectory } from './upload-config';
import { TEMPLATES_DIR, renderTourShell } from './tour-shell';

// Initialize S3 client
//
// The default AWS SDK v3 Node request handler has NO socket/connection
// timeout - a PUT that never gets a response (a dropped connection, a
// stalled proxy, S3 briefly not answering) just hangs forever with no
// error and no retry. That's exactly what a stuck-at-some-percentage tour
// upload looks like from the client: the sequential loop below is waiting
// on one file's promise that will never resolve or reject, so no further
// progress events ever fire and the SSE stream goes quiet without an
// error - the browser has no way to tell "still working" from "wedged."
// Explicit timeouts turn a silent hang into a real, retryable failure
// (maxAttempts below) that either recovers or surfaces as a genuine error
// message instead of an infinite spinner.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },
  maxAttempts: 4,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10_000,
    // Uploads now run with real concurrency (see UPLOAD_CONCURRENCY below),
    // so one slow file no longer blocks every other file behind it in a
    // single-file queue - a shorter socket timeout here means a genuinely
    // stuck connection is detected and retried sooner, instead of holding
    // one of the parallel slots hostage for a full minute.
    socketTimeout: 30_000,
  }),
});

const BUCKET_NAME = process.env.S3_TOURS_BUCKET || 'realevr-tours';
const REGION = process.env.AWS_REGION || 'us-east-1';

// S3 Transfer Acceleration: routes a part's PUT through the nearest AWS edge
// location (CloudFront's global network) instead of going directly to the
// bucket's home region over the public internet - real leverage on top of
// this file's own parallel-multipart upload, specifically for agents
// uploading from Uganda/East Africa into a bucket whose region is
// unlikely to be anywhere nearby. Used ONLY for the presigned part-upload
// URLs below (the actual browser->S3 data transfer, which is the leg
// acceleration speeds up) - CreateMultipartUpload/CompleteMultipartUpload
// move no file bytes themselves, so they stay on the regular client.
// Disable by setting S3_TRANSFER_ACCELERATION=false if a deploy's AWS
// account doesn't have it enabled for this bucket (it's an opt-in
// per-bucket setting - see setupS3TourBucket's own accelerate call below).
const TRANSFER_ACCELERATION_ENABLED = process.env.S3_TRANSFER_ACCELERATION !== 'false';

// Clients used ONLY to sign browser-facing part-upload URLs (nothing is sent
// through them). `requestChecksumCalculation: 'WHEN_REQUIRED'` matters here:
// since AWS SDK v3 3.729 the default ('WHEN_SUPPORTED') bakes an
// x-amz-checksum-crc32 of the EMPTY body into a presigned UploadPart URL,
// which S3 then rejects against the real part a browser actually sends.
// UploadPart never requires a checksum, so opt out for signing only and
// leave s3Client's behavior for the server's own PUTs untouched.
const presignClientConfig = {
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },
  maxAttempts: 4,
  requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  requestHandler: new NodeHttpHandler({ connectionTimeout: 10_000, socketTimeout: 30_000 }),
};
const s3StandardPresignClient = new S3Client(presignClientConfig);
const s3AccelerateClient = new S3Client({ ...presignClientConfig, useAccelerateEndpoint: true });

interface UploadState {
  uploadedFiles: number;
  totalFiles: number;
  onProgress: (progress: number) => void;
}

// setupS3TourBucket() used to run on EVERY tour upload - a HeadBucket plus
// two more S3 admin calls (PutBucketCors, PutBucketPolicy) before a single
// file's worth of actual work happened. Besides being wasted round trips,
// each one is another chance to hit the exact hang this file's request
// timeouts are guarding against, delaying the "Uploading files..." stage
// for no reason once the bucket is already configured. Cache success for
// the life of the process; a failure clears the cache so the next upload
// still retries setup instead of being stuck permanently unconfigured.
let bucketReady = false;

// The browser PUTs tour ZIP parts straight to this bucket, cross-origin, so
// without these rules S3 answers the preflight with no CORS headers and the
// browser reports a bare network error (XHR onerror, no HTTP status) - the
// "Part 1 upload failed" symptom. ETag must be exposed too: it's the only way
// the browser can learn each part's ETag for CompleteMultipartUpload.
const TOUR_BUCKET_CORS_RULES = [
  {
    AllowedOrigins: ["*"],
    AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag", "Content-Length", "x-amz-request-id"],
    MaxAgeSeconds: 3600,
  },
];

// setupS3TourBucket only runs at boot, and it aborts at the first failing
// step (the bucket-policy call, for instance, is rejected outright when the
// account has Block Public Access on) - which used to leave CORS unapplied
// for the presign path that actually needs it. This applies JUST the CORS
// rules, once per process, and never throws: a missing s3:PutBucketCORS
// permission shouldn't take uploads down if the bucket is already
// configured correctly by hand.
let corsEnsured = false;
async function ensureBucketCors(): Promise<void> {
  if (corsEnsured) return;
  try {
    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET_NAME,
        CORSConfiguration: { CORSRules: TOUR_BUCKET_CORS_RULES },
      })
    );
    corsEnsured = true;
  } catch (err) {
    console.warn("Could not apply CORS rules to the tours bucket (uploads work only if it's already configured):", err);
  }
}

// Transfer Acceleration only works if the bucket has it switched on -
// otherwise S3 rejects every request to the s3-accelerate.amazonaws.com
// endpoint, and (with no CORS headers on that rejection) a browser sees a
// network error, not a readable message. setupS3TourBucket's enable call is
// best-effort and runs LAST, so it's skipped whenever an earlier setup step
// fails, or swallowed if the IAM user lacks s3:PutAccelerateConfiguration.
// So: use the accelerate endpoint only once the bucket verifiably reports
// Enabled, and quietly try to turn it on in the background of a request that
// falls back to the standard endpoint. A "no" is re-checked after a few
// minutes rather than cached forever, so fixing the permission or the
// bucket setting takes effect without a redeploy.
const ACCELERATION_RECHECK_MS = 5 * 60_000;
let accelerationCheck: { usable: boolean; checkedAt: number } | null = null;

async function isAccelerationUsable(): Promise<boolean> {
  if (!TRANSFER_ACCELERATION_ENABLED) return false;
  if (accelerationCheck && (accelerationCheck.usable || Date.now() - accelerationCheck.checkedAt < ACCELERATION_RECHECK_MS)) {
    return accelerationCheck.usable;
  }

  let usable = false;
  try {
    const current = await s3Client.send(new GetBucketAccelerateConfigurationCommand({ Bucket: BUCKET_NAME }));
    usable = current.Status === 'Enabled';
  } catch (err) {
    console.warn("Could not read the tours bucket's Transfer Acceleration setting; using the standard endpoint:", err);
  }

  if (!usable) {
    // Not on yet (or unreadable): try to enable it for next time. This
    // request stays on the standard endpoint - a bucket that was only just
    // switched on can take a little while before the accelerate endpoint
    // answers reliably.
    try {
      await s3Client.send(
        new PutBucketAccelerateConfigurationCommand({ Bucket: BUCKET_NAME, AccelerateConfiguration: { Status: 'Enabled' } })
      );
      console.log("Requested S3 Transfer Acceleration for the tours bucket; using it once it reports Enabled");
    } catch (err) {
      console.warn("Could not enable S3 Transfer Acceleration (uploads use the standard endpoint):", err);
    }
  }

  accelerationCheck = { usable, checkedAt: Date.now() };
  return usable;
}

export async function setupS3TourBucket(): Promise<void> {
  if (bucketReady) return;
  try {
    // 1️⃣ Check if bucket exists
    try {
      await s3Client.send(
        new HeadBucketCommand({ Bucket: BUCKET_NAME })
      );
      console.log(`Bucket ${BUCKET_NAME} already exists`);
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        await s3Client.send(
          new CreateBucketCommand({
            Bucket: BUCKET_NAME,
            ...(REGION !== "us-east-1" && {
              CreateBucketConfiguration: {
                LocationConstraint: REGION as BucketLocationConstraint
              }
            })
          })
        );
        console.log(`Created bucket: ${BUCKET_NAME}`);
      } else {
        throw err;
      }
    }

    // 2️⃣ Set proper CORS (THIS FIXES YOUR ISSUE)
    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET_NAME,
        CORSConfiguration: { CORSRules: TOUR_BUCKET_CORS_RULES }
      })
    );
    corsEnsured = true;

    console.log("S3 CORS configuration set successfully");

    // 3️⃣ Public READ policy (safe)
    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET_NAME,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "PublicReadGetObject",
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
            }
          ]
        })
      })
    );

    console.log("Bucket policy set for public read access");

    // 4️⃣ Transfer Acceleration - see s3AccelerateClient's own comment for
    // why this matters for upload speed. Best-effort: some AWS accounts
    // don't have acceleration available for a given bucket/region
    // combination, and that's not worth failing the whole setup over -
    // the presigned part URLs just fall back to s3Client's plain endpoint
    // if this doesn't take (see createStagingMultipartUpload).
    if (TRANSFER_ACCELERATION_ENABLED) {
      try {
        await s3Client.send(
          new PutBucketAccelerateConfigurationCommand({
            Bucket: BUCKET_NAME,
            AccelerateConfiguration: { Status: 'Enabled' },
          })
        );
        console.log("S3 Transfer Acceleration enabled");
      } catch (accelError) {
        console.warn("Could not enable S3 Transfer Acceleration (non-fatal, uploads still work without it):", accelError);
      }
    }

    console.log("S3 bucket configured successfully ✅");
    bucketReady = true;

  } catch (error) {
    console.error("S3 bucket setup failed:", error);
    throw error;
  }
}

// Get MIME type for file with proper HTML tour support
function getMimeType(filePath: string): string {
  const mimeType = mime.lookup(filePath);
  
  if (!mimeType) {
    const ext = path.extname(filePath).toLowerCase();
    
    // Handle common tour file types
    switch (ext) {
      case '.htm':
      case '.html':
        return 'text/html';
      case '.css':
        return 'text/css';
      case '.js':
        return 'application/javascript';
      case '.json':
        return 'application/json';
      case '.xml':
        return 'application/xml';
      case '.txt':
        return 'text/plain';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.mp4':
        return 'video/mp4';
      case '.webm':
        return 'video/webm';
      case '.ogg':
        return 'video/ogg';
      default:
        return 'application/octet-stream';
    }
  }
  
  return mimeType;
}

// Upload single file to S3 with proper metadata
async function uploadFileToS3(
  localPath: string,
  s3Key: string,
  contentType: string,
  fileSize: number
): Promise<void> {
  // Stream the body instead of reading the whole file into memory with
  // readFileSync: 3D Vista exports routinely include multi-hundred-MB
  // panorama images and preview videos, and loading each one fully into
  // memory before the PUT even starts is unnecessary memory pressure on
  // top of whatever else the server process is holding for other
  // concurrent uploads - a real path to the process getting OOM-killed
  // mid-upload, which would silently drop the SSE connection and freeze
  // the client's progress bar with no error, indistinguishable from a
  // network hang.
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fs.createReadStream(localPath),
    ContentLength: fileSize,
    ContentType: contentType,
    // Set cache control for performance
    // tour.json is editable after publishing (rooms get connected with doors -
    // see tour-links.ts), so like the page itself it must be revalidated, not
    // cached for a year. Panoramas and photos never change under the same name.
    CacheControl:
      contentType.startsWith('text/html') || s3Key.endsWith('/tour.json') ? 'no-cache' : 'public, max-age=31536000',
    // Additional metadata
    Metadata: {
      'uploaded-by': 'realevr-system',
      'upload-timestamp': new Date().toISOString()
    }
  };

  // Upload the file. The bucket policy will make it public.
  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
  } catch (error: any) {
    console.error(`Failed to upload ${s3Key}:`, error);
    throw error;
  }
}

// The S3 client above already retries transient failures per-request
// (maxAttempts: 4), but that only covers a single PutObjectCommand call.
// A file that fails after those internal retries are exhausted (e.g. a
// slow connection that keeps timing out just past the socket timeout)
// used to take the ENTIRE tour down with it - one bad file out of
// hundreds aborting everything already uploaded before it. Wrap each
// file in one more outer retry with a short backoff before giving up on
// it for real, so a single flaky file doesn't sink an otherwise-healthy
// upload.
async function uploadFileWithRetry(
  localPath: string,
  s3Key: string,
  contentType: string,
  fileSize: number,
  attempts = 2
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await uploadFileToS3(localPath, s3Key, contentType, fileSize);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      const backoffMs = 1000 * attempt;
      console.warn(`Retrying ${s3Key} after failure (attempt ${attempt}/${attempts}), waiting ${backoffMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

// How many files to upload to S3 at once. This was the real speed problem:
// a 3D Vista export routinely contains hundreds of small tile images, and
// uploading them one at a time - each a full network round trip - is why
// a tour that should take seconds was taking minutes, and why a single
// slow file stalled the WHOLE progress bar instead of just its own share
// of it (everything behind it in the one-at-a-time queue simply waited).
// 16 concurrent PUTs is comfortably inside S3's per-prefix request-rate
// headroom (S3 scales well past this for a single prefix) and cuts wall
// clock time for a many-small-files tour by roughly the same factor. Was
// 8; with the raw ZIP transfer itself now also parallelized (see the
// multipart-upload support below), this stage no longer needs to leave
// as much bandwidth headroom for a single competing large transfer.
const UPLOAD_CONCURRENCY = 16;

// Uploads `files` with up to `concurrency` requests in flight at once,
// calling onProgress(completed / total) as each one finishes (not in file
// order - whichever finishes first reports first). Stops handing out new
// work once a file fails for real (all its own retries exhausted), but
// lets whatever's already in flight settle before rejecting with that
// error, rather than leaving orphaned uploads racing in the background.
async function uploadFilesInParallel(
  files: Array<{ localPath: string; s3Key: string; size: number }>,
  onProgress: (progress: number) => void,
  concurrency: number = UPLOAD_CONCURRENCY
): Promise<void> {
  const total = files.length;
  let completed = 0;
  let nextIndex = 0;
  let firstError: unknown = null;

  async function worker() {
    while (true) {
      if (firstError) return;
      const myIndex = nextIndex++;
      if (myIndex >= files.length) return;
      const file = files[myIndex];
      try {
        const contentType = getMimeType(file.localPath);
        await uploadFileWithRetry(file.localPath, file.s3Key, contentType, file.size);
        completed++;
        onProgress(completed / total);
        console.log(`✓ Uploaded: ${path.basename(file.localPath)} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      } catch (error) {
        console.error(`✗ Failed to upload ${path.basename(file.localPath)}:`, error);
        if (!firstError) firstError = error;
      }
    }
  }

  const workerCount = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (firstError) throw firstError;
}

// Collect all files recursively
function collectAllFiles(dir: string, basePath: string = ''): Array<{localPath: string, s3Key: string, size: number}> {
  const files: Array<{localPath: string, s3Key: string, size: number}> = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const localPath = path.join(dir, entry.name);
      const s3Key = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(localPath)) {
          files.push(...collectAllFiles(localPath, s3Key));
        }
      } else if (entry.isFile()) {
        if (!shouldSkipFile(localPath)) {
          const stats = fs.statSync(localPath);
          files.push({
            localPath,
            s3Key,
            size: stats.size
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error collecting files from ${dir}:`, error);
  }
  
  return files;
}

// Count files recursively
const countFilesRecursive = (dir: string): number => {
  let count = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (!shouldSkipDirectory(filePath)) {
          count += countFilesRecursive(filePath);
        }
      } else {
        if (!shouldSkipFile(filePath)) {
          count++;
        }
      }
    }
  } catch (error) {
    console.error(`Error counting files in ${dir}:`, error);
  }
  return count;
};

// Main upload function
export async function uploadTourToS3(
  extractedFolderPath: string,
  propertyId: string,
  onProgress: (progress: number) => void
): Promise<string> {
  try {
    // Ensure bucket is setup
    await setupS3TourBucket();

    let uploadRoot = extractedFolderPath;
    const entries = fs.readdirSync(extractedFolderPath);
    
    // If the extracted folder contains a single directory, treat that as the root
    if (entries.length === 1 && fs.statSync(path.join(extractedFolderPath, entries[0])).isDirectory()) {
      uploadRoot = path.join(extractedFolderPath, entries[0]);
    }
    
    const tourName = path.basename(extractedFolderPath);
    const s3KeyPrefix = `tours/property_${propertyId}/${tourName}`;
    
    // Find index file
    const findIndexFile = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
          return path.relative(uploadRoot, fullPath).replace(/\\/g, '/');
        } else if (entry.isDirectory()) {
          const found = findIndexFile(fullPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    const indexFile = findIndexFile(uploadRoot) || 'index.html';
    const files = collectAllFiles(uploadRoot, s3KeyPrefix);
    const totalFiles = files.length;
    
    if (totalFiles === 0) {
      onProgress(1);
      throw new Error('No files found to upload');
    }
    
    console.log(`Uploading ${totalFiles} files to S3 (${UPLOAD_CONCURRENCY} at a time)...`);

    await uploadFilesInParallel(files, onProgress);


    // Construct the public URL for the tour
    const indexS3Key = `${s3KeyPrefix}/${indexFile}`;
    const tourUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${indexS3Key}`;
    
    console.log(`Tour uploaded successfully to S3: ${tourUrl}`);
    return tourUrl;
    
  } catch (error: any) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload tour to S3: ${error.message}`);
  }
}

// --- Direct-to-S3 upload support (staging ZIPs) ---
//
// The functions below back the presign-zip / process-from-s3 upload path
// (see server/upload.ts's presignTourZipUpload and processTourFromS3).
// They reuse the SAME s3Client configured above - the connection/socket
// timeouts and retry count that make the existing per-file upload loop
// resilient to a silent hang apply just as much to a single large staging
// PUT or a streamed download of one.

// A single presigned PUT for the whole ZIP was the first version of this
// path, and it was still slow: one file over one TCP connection is capped
// by that one connection's own throughput (and, on a higher-latency
// mobile link, by TCP's own slow-start/window-size behavior long before
// the client's real uplink bandwidth is saturated) - and a failure
// anywhere in a multi-GB PUT meant starting the whole thing over. S3
// multipart upload splits the file into independent parts, each with its
// own presigned URL, uploaded over SEPARATE parallel connections: several
// times faster on a decent connection (multiple TCP streams sharing the
// available bandwidth instead of one), and a failed 16MB part retries in
// seconds instead of restarting a multi-GB transfer. S3's minimum part
// size (5MB) only applies to parts that AREN'T the last one, so this same
// code path works unchanged for small ZIPs too - they just end up as a
// single "part".
const MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024; // 16MB

export interface MultipartUploadPart {
  partNumber: number;
  uploadUrl: string;
}

/**
 * Starts a multipart upload for a browser to PUT a tour ZIP directly to a
 * STAGING key in this bucket, split into `MULTIPART_PART_SIZE_BYTES`
 * chunks - bypassing our own Node server for the transfer itself, see
 * presignTourZipUpload's own doc comment for why. Returns one presigned
 * PUT URL per part; the caller uploads each part's byte range to its own
 * URL (in parallel) and then calls completeMultipartUpload with the
 * resulting ETags.
 *
 * Deliberately does NOT touch the bucket's public-read policy (see
 * setupS3TourBucket above): that policy makes the FINAL, extracted tour
 * files public, which is correct for a hosted tour but not for an
 * in-progress/raw ZIP sitting in staging-tours/ - a presigned PUT grants
 * only the ability to write this one object (or, here, one part of it) at
 * this one key, and nothing about writing an object makes it publicly
 * *readable* on top of that.
 */
export async function createStagingMultipartUpload(
  s3Key: string,
  contentType: string,
  fileSizeBytes: number,
  expiresInSeconds: number,
  options: { forceStandardEndpoint?: boolean } = {}
): Promise<{ uploadId: string; partSize: number; parts: MultipartUploadPart[]; accelerated: boolean }> {
  // The browser talks to the bucket directly from here on, so the bucket's
  // CORS rules have to be in place before any URL is handed out.
  await ensureBucketCors();

  // Accelerated only when the bucket verifiably has it on AND the caller
  // hasn't asked for the standard route (the browser asks for that after
  // failing to reach the accelerate endpoint - some networks block or
  // mangle it even when the bucket is configured correctly).
  const accelerated = !options.forceStandardEndpoint && (await isAccelerationUsable());
  const signingClient = accelerated ? s3AccelerateClient : s3StandardPresignClient;

  const created = await s3Client.send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: s3Key, ContentType: contentType })
  );
  const uploadId = created.UploadId;
  if (!uploadId) {
    throw new Error('S3 did not return an UploadId for the multipart upload');
  }

  const partCount = Math.max(1, Math.ceil(fileSizeBytes / MULTIPART_PART_SIZE_BYTES));

  // Signing each part is a local computation (no network call to AWS), so
  // doing this for a few hundred parts in parallel is negligible - even a
  // 5GB tour at 16MB/part is only ~320 parts.
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, i) => {
      const partNumber = i + 1;
      const command = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      // Signed with the accelerate-endpoint client only when acceleration is
      // verified usable (so the URL points at s3-accelerate.amazonaws.com);
      // otherwise the standard regional endpoint - see isAccelerationUsable.
      const uploadUrl = await getSignedUrl(signingClient, command, { expiresIn: expiresInSeconds });
      return { partNumber, uploadUrl };
    })
  );

  return { uploadId, partSize: MULTIPART_PART_SIZE_BYTES, parts, accelerated };
}

/**
 * Finalizes a multipart upload once every part has been PUT successfully.
 * S3 requires the part list sorted by part number with the ETag each
 * part's PUT response returned (via the ETag response header - the
 * bucket's CORS config above already exposes that header for a browser to
 * read cross-origin).
 */
export async function completeStagingMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

/**
 * Best-effort cleanup for a multipart upload that was started but never
 * completed (the client gave up, hit an error, or closed the tab
 * mid-upload). Uncompleted parts otherwise sit in the bucket incurring
 * storage cost indefinitely - S3 doesn't garbage-collect them on its own
 * without a lifecycle rule. Never let a failure here surface as an error
 * to the user; it's tidying up, not part of the upload itself.
 */
export async function abortStagingMultipartUpload(s3Key: string, uploadId: string): Promise<void> {
  await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: s3Key, UploadId: uploadId }));
}

/**
 * Streams an S3 object straight to a local file instead of buffering it in
 * memory - the staging ZIPs landing here are the same multi-hundred-MB-to-
 * multi-GB tour exports uploadFileToS3 above already has to be careful
 * about, just moving in the opposite direction (S3 -> disk instead of
 * disk -> S3).
 */
export async function downloadFromS3ToFile(s3Key: string, localPath: string): Promise<void> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
  const body = response.Body;
  if (!body) {
    throw new Error(`S3 object ${s3Key} returned no body`);
  }

  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(localPath);
    // Under Node (the NodeHttpHandler configured above), response.Body is
    // always a Node Readable stream - the Blob/web-ReadableStream members
    // of its TS type only apply to browser/fetch-based runtimes we don't
    // use here.
    const readStream = body as unknown as NodeJS.ReadableStream;
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    readStream.pipe(writeStream);
  });
}

/**
 * Best-effort delete of a staging ZIP once its contents have been
 * extracted and re-uploaded as the real hosted tour. Callers treat a
 * failure here as non-fatal (log and move on) - the tour itself has
 * already succeeded by the point this is called, and an orphaned object
 * under staging-tours/ is a minor cleanup issue, not a broken upload.
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
}

// Check if tour exists in S3
export async function tourExistsInS3(propertyId: string): Promise<boolean> {
  try {
    // This would require listing objects with the prefix, but for simplicity
    // we'll return false and let the upload proceed
    return false;
  } catch (error) {
    console.error('Error checking tour existence in S3:', error);
    return false;
  }
}

// Initialize S3 configuration
export async function initializeS3() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('AWS credentials not found in environment variables');
    console.warn('Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    return;
  }
  
  if (!process.env.AWS_REGION) {
    console.warn('AWS_REGION not set, using us-east-1 as default');
  }
  
  try {
    await setupS3TourBucket();
    console.log('S3 tour hosting initialized successfully');
  } catch (error) {
    console.error('Failed to initialize S3 tour hosting:', error);
  }

  // Independent of the bucket setup above: it's only PutObject, and a setup
  // step failing (e.g. the public-read policy) shouldn't stop the tour
  // viewer from being published - or leave it stale after a deploy.
  try {
    await ensureTourViewerAssets();
    console.log('Shared tour viewer assets published');

    // Tours published before the viewer moved into the shared folder still
    // point at the old CDN and show a black screen. Fix them in the
    // background (not awaited - startup shouldn't wait on it); tours already
    // on the current shell are skipped, so this is cheap on later boots.
    refreshAllGeneratedTourShells()
      .then((summary) => {
        console.log(
          `Phone-captured tours checked: ${summary.checked}, updated: ${summary.updated}, failed: ${summary.failed.length}`
        );
        summary.failed.forEach((f) => console.warn(`  property ${f.propertyId}: ${f.error}`));
      })
      .catch((error) => console.error('Failed to refresh phone-captured tour shells:', error));
  } catch (error) {
    console.error('Failed to publish shared tour viewer assets:', error);
  }
}

// --- Shared viewer for phone-captured tours ---
//
// A generated tour's index.html is a thin shell; the viewer it runs (Photo
// Sphere Viewer with its three.js, bundled into one file, plus our tour-app
// script and styles) lives ONCE in the bucket under tour-viewer/current/ and
// every tour points at it. That has three consequences worth knowing:
//   - No third-party CDN at view time. The old template pulled a floating
//     `@5` alias from jsDelivr, which silently stopped working (that
//     version needs a separate three.js the page never loaded), leaving
//     every tour a black screen.
//   - Same origin as the tours, so nothing cross-origin to configure.
//   - A viewer fix or redesign is one publish (the next boot/deploy), not a
//     re-publish of every tour.
// The files are re-published on every boot (they're ~170KB gzipped), so what
// is in the bucket always matches the deployed code.
const TOUR_VIEWER_KEY_PREFIX = 'tour-viewer/current';
const TOUR_VIEWER_FILES = ['psv-viewer.js', 'psv-viewer.css', 'tour-app.js', 'tour-app.css'] as const;

export function getTourViewerBaseUrl(): string {
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${TOUR_VIEWER_KEY_PREFIX}`;
}

let viewerAssetsPublished: Promise<void> | null = null;

export function ensureTourViewerAssets(): Promise<void> {
  if (!viewerAssetsPublished) {
    // A failure clears the cache so the next call tries again.
    viewerAssetsPublished = publishTourViewerAssets().catch((err) => {
      viewerAssetsPublished = null;
      throw err;
    });
  }
  return viewerAssetsPublished;
}

async function publishTourViewerAssets(): Promise<void> {
  const dir = path.join(TEMPLATES_DIR, 'tour-viewer');
  await Promise.all(
    TOUR_VIEWER_FILES.map(async (name) => {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${TOUR_VIEWER_KEY_PREFIX}/${name}`,
          Body: zlib.gzipSync(fs.readFileSync(path.join(dir, name)), { level: 9 }),
          ContentType: name.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
          ContentEncoding: 'gzip',
          // One URL for every tour and every future release, so the cache
          // is deliberately short; S3's ETag makes each revalidation a
          // cheap 304 rather than a re-download.
          CacheControl: 'public, max-age=300, must-revalidate',
        })
      );
    })
  );
}

/** The tour isn't a phone-captured one (no tour.json beside its index.html). */
export class NotAGeneratedTourError extends Error {
  constructor() {
    super('This tour was not captured with the phone flow (no tour.json found), so there is nothing to refresh.');
    this.name = 'NotAGeneratedTourError';
  }
}

/**
 * Rewrites an already-published phone-captured tour's index.html to the
 * current shell, so tours published before the viewer was moved into the
 * shared bucket folder (and so still pointing at the broken CDN) start
 * working without being re-captured. Reads the title back from the tour's
 * own tour.json; touches nothing else in the tour. A tour already on the
 * current shell is left alone (`changed: false`), so running this over every
 * tour is cheap and safe to repeat.
 */
/**
 * Where a phone-captured tour's files live: the S3 folder (ending in "/")
 * holding its index.html, tour.json and panos/. The key comes from a stored
 * URL, so it is only accepted for this bucket and this property's own tours/
 * folder; anything else is "not a generated tour" rather than an error.
 */
export function resolveGeneratedTourFolder(tourUrl: string, propertyId: string): string {
  let url: URL;
  try {
    url = new URL(tourUrl);
  } catch {
    throw new Error('The stored tour URL is not a valid URL');
  }
  const key = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const expectedHost = `${BUCKET_NAME}.s3.${REGION}.amazonaws.com`;
  const ownPrefix = `tours/property_${propertyId}/`;
  if (url.host !== expectedHost || !key.startsWith(ownPrefix) || key.includes('..') || !key.endsWith('/index.html')) {
    throw new NotAGeneratedTourError();
  }
  return key.slice(0, -'index.html'.length);
}

/** Read one object from the tours bucket; null when it does not exist. */
export async function readTourObject(key: string): Promise<Buffer | null> {
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function writeTourObject(key: string, body: Buffer | string, contentType: string, cacheControl: string): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl })
  );
}

export async function refreshGeneratedTourShell(
  tourUrl: string,
  propertyId: string
): Promise<{ title: string; changed: boolean }> {
  const folder = resolveGeneratedTourFolder(tourUrl, propertyId);
  const key = `${folder}index.html`;

  const readText = async (objectKey: string): Promise<string> => {
    try {
      const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: objectKey }));
      return (await res.Body?.transformToString()) || '';
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) throw new NotAGeneratedTourError();
      throw err;
    }
  };

  // A 3D Vista export has no tour.json; only our own generated tours do.
  const tourJson = JSON.parse((await readText(`${folder}tour.json`)) || '{}');
  const title = typeof tourJson.title === 'string' && tourJson.title ? tourJson.title : 'Virtual Tour';

  const currentShell = await readText(key);
  if (currentShell.includes(`${getTourViewerBaseUrl()}/tour-app.js`)) {
    return { title, changed: false };
  }

  await ensureTourViewerAssets();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: renderTourShell(title, getTourViewerBaseUrl()),
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'no-cache',
    })
  );
  return { title, changed: true };
}

/**
 * Runs refreshGeneratedTourShell over every property with a phone-captured
 * tour (tourQuality is only ever set by that flow - see room-capture.ts),
 * one at a time so it never competes with real traffic. Never throws: one
 * tour failing is recorded and the rest carry on.
 */
export async function refreshAllGeneratedTourShells(): Promise<{
  checked: number;
  updated: number;
  failed: Array<{ propertyId: number; error: string }>;
}> {
  const { storage } = await import('./storage');
  const properties = await storage.getAllProperties();
  const candidates = properties.filter((p) => p.tourUrl && p.tourQuality);

  let updated = 0;
  const failed: Array<{ propertyId: number; error: string }> = [];
  for (const property of candidates) {
    try {
      const { changed } = await refreshGeneratedTourShell(property.tourUrl!, String(property.id));
      if (changed) updated++;
    } catch (err: any) {
      failed.push({ propertyId: property.id, error: err?.message || String(err) });
    }
  }
  return { checked: candidates.length, updated, failed };
}
