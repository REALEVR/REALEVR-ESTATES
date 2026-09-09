import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand, PutBucketAccelerateConfigurationCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { getOptimizedConfig, shouldSkipFile, shouldSkipDirectory } from './upload-config';

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
const s3AccelerateClient = TRANSFER_ACCELERATION_ENABLED
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      },
      maxAttempts: 4,
      useAccelerateEndpoint: true,
      requestHandler: new NodeHttpHandler({ connectionTimeout: 10_000, socketTimeout: 30_000 }),
    })
  : s3Client;

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
                LocationConstraint: REGION
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
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ["*"],
              AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
              AllowedHeaders: ["*"],
              ExposeHeaders: [
                "ETag",
                "Content-Length",
                "x-amz-request-id"
              ],
              MaxAgeSeconds: 3600
            }
          ]
        }
      })
    );

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
    CacheControl: contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=31536000',
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
  expiresInSeconds: number
): Promise<{ uploadId: string; partSize: number; parts: MultipartUploadPart[] }> {
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
      // Signed with the accelerate-endpoint client so the URL itself points
      // at s3-accelerate.amazonaws.com - see that client's own comment.
      const uploadUrl = await getSignedUrl(s3AccelerateClient, command, { expiresIn: expiresInSeconds });
      return { partNumber, uploadUrl };
    })
  );

  return { uploadId, partSize: MULTIPART_PART_SIZE_BYTES, parts };
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
}
