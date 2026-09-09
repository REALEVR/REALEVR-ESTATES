import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface ExtractProgress {
  extracted: number;
  total: number;
}

/**
 * Extracts a virtual-tour ZIP into `extractDir` and locates its index.html.
 *
 * Factored out of upload.ts's uploadVirtualTour so the zip-slip guard below
 * has exactly ONE implementation, shared by both the legacy relay-through-
 * -our-server upload path and the newer presigned-direct-to-S3 path (see
 * processTourFromS3 in upload.ts, wired up in routes.ts as
 * /presign-zip + /process-from-s3). That guard is security-relevant - it's
 * what stops a malicious ZIP entry like "../../etc/cron.d/x" or an absolute
 * in-zip path from writing outside extractDir - and duplicating it across
 * two upload paths would just be two chances for the copies to drift out of
 * sync as one gets fixed/changed and the other doesn't.
 */
export function extractTourZip(
  zipPath: string,
  extractDir: string,
  onProgress?: (progress: ExtractProgress) => void
): { indexFile: string } {
  const zip = new AdmZip(zipPath);
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  const zipEntries = zip.getEntries();
  const totalEntries = zipEntries.length;
  let extracted = 0;

  for (const entry of zipEntries) {
    const entryPath = path.join(extractDir, entry.entryName);
    // Zip-slip guard: reject any entry whose resolved path escapes extractDir
    // (e.g. "../../etc/cron.d/x" or an absolute path inside the zip).
    const resolvedEntryPath = path.resolve(entryPath);
    const resolvedExtractDir = path.resolve(extractDir) + path.sep;
    if (!resolvedEntryPath.startsWith(resolvedExtractDir)) {
      throw new Error(`Rejected unsafe ZIP entry path: ${entry.entryName}`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(entryPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(entryPath), { recursive: true });
      fs.writeFileSync(entryPath, entry.getData());
    }

    extracted++;
    onProgress?.({ extracted, total: totalEntries });
  }

  const indexFile = findIndexFile(extractDir, extractDir) || 'index.html';
  return { indexFile };
}

// Kept byte-for-byte equivalent to the closure that used to live inline in
// uploadVirtualTour (just with `extractDir` passed explicitly instead of
// captured) - do not "fix" the directory-prefixing quirk here as part of
// this refactor; the goal is identical behavior to the pre-existing path,
// not a behavior change bundled into a refactor.
function findIndexFile(dir: string, extractDir: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
      return path.relative(extractDir, fullPath).replace(/\\/g, '/');
    } else if (entry.isDirectory()) {
      const found = findIndexFile(fullPath, extractDir);
      if (found) return path.join(entry.name, found).replace(/\\/g, '/');
    }
  }
  return null;
}
