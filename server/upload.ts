import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { nanoid } from 'nanoid';
import AdmZip from 'adm-zip';
// @ts-ignore
import { uploadTourDirToFTP } from "./ftp-upload";
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

// Configure storage for property images
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imageDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = nanoid(8);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

// Configure storage for virtual tour zip files
const tourStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tourDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = nanoid(8);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

// Property image upload middleware
export const uploadPropertyImage = multer({
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
}).single('image');

// --- Virtual Tour Upload with SSE Progress ---
export const uploadVirtualTour = (req: Request, res: Response, next: NextFunction) => {
  const multerDisk = multer({ storage: tourStorage }).single('tourZip');
  multerDisk(req, res, async (err: any) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const propertyId = req.body.propertyId || nanoid(8); // fallback if not provided
      const jobId = createJob();
      res.status(200).json({ jobId }); // Respond immediately with jobId

      // Start extraction/FTP in background
      (async () => {
        try {
          sendProgress(jobId, { progress: 5, message: 'Extracting ZIP...' });
          const zip = new AdmZip((req.file as Express.Multer.File).path);
          const extractDir = path.join(tourDir, `property_${propertyId}_tour`);
          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
          await mkdirAsync(extractDir, { recursive: true });
          zip.extractAllTo(extractDir, true);
          sendProgress(jobId, { progress: 20, message: 'ZIP extracted. Scanning for index file...' });

          // Recursively find index.html or index.htm
          const findIndexFile = (dir: string): string | null => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
                return path.relative(extractDir, fullPath).replace(/\\/g, '/');
              } else if (entry.isDirectory()) {
                const found = findIndexFile(fullPath);
                if (found) return path.join(entry.name, found).replace(/\\/g, '/');
              }
            }
            return null;
          };
          const indexFile = findIndexFile(extractDir) || 'index.html';
          sendProgress(jobId, { progress: 30, message: `Uploading files to FTP...` });

          // Upload to FTP, optionally update progress inside uploadTourDirToFTP
          await uploadTourDirToFTP(extractDir, propertyId, (percent: number, msg: string) => {
            sendProgress(jobId, { progress: 30 + Math.round(percent * 0.6), message: msg });
          });

          sendProgress(jobId, { progress: 95, message: 'Cleaning up...' });
          await unlinkAsync((req.file as Express.Multer.File).path);

          const tourUrl = `https://${process.env.FTP_HOST}/tours/property_${propertyId}_tour/${indexFile}`;
          
          // Save tour configuration for persistence across deployments
          const { addTourConfig } = await import('./tour-config');
          addTourConfig({
            propertyId,
            tourUrl,
            uploadedAt: new Date().toISOString(),
            ftpPath: `/tours/property_${propertyId}_tour/${indexFile}`
          });
          
          sendProgress(jobId, { progress: 100, message: 'Done!', done: true, tourUrl });
        } catch (e: any) {
          sendProgress(jobId, { error: e.message, done: true });
        }
      })();
    } catch (e: any) {
      return res.status(500).json({ error: e.message, stack: e.stack });
    }
  });
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
  req.on('close', () => {
    // Optionally clean up listeners
  });
};

// --- Test endpoint: upload a single file to FTP tour folder with SSE progress ---
export const uploadTestFileToFTP = async (req: Request, res: Response) => {
  try {
    const multerDisk = multer({ storage: tourStorage }).single('testFile');
    multerDisk(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const propertyId = req.body.propertyId || nanoid(8);
      const jobId = createJob();
      const file = req.file; // assign to local variable for type safety
      res.status(200).json({ jobId }); // Respond immediately with jobId

      // Start FTP upload in background
      (async () => {
        try {
          sendProgress(jobId, { progress: 5, message: 'Preparing test upload...' });
          // Create a temp folder for this test
          const tempDir = path.join(tourDir, `test_${propertyId}_${Date.now()}`);
          await mkdirAsync(tempDir, { recursive: true });
          const destPath = path.join(tempDir, file.originalname);
          fs.copyFileSync(file.path, destPath);
          sendProgress(jobId, { progress: 20, message: 'Uploading file to FTP...' });
          // Upload to FTP
          await uploadTourDirToFTP(tempDir, propertyId, (percent: number, msg: string) => {
            sendProgress(jobId, { progress: 20 + Math.round(percent * 0.7), message: msg });
          });
          sendProgress(jobId, { progress: 95, message: 'Cleaning up...' });
          fs.rmSync(tempDir, { recursive: true, force: true });
          await unlinkAsync(file.path);
          sendProgress(jobId, { progress: 100, message: 'Test file uploaded to FTP', done: true, propertyId });
        } catch (e: any) {
          sendProgress(jobId, { error: e.message, done: true });
        }
      })();
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// --- SSE Progress Endpoint for test FTP upload ---
export const sseTestFtpProgress = (req: Request, res: Response) => {
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
  req.on('close', () => {
    // Optionally clean up listeners
  });
};

// Register routes (add to your Express app)
export function registerTourUploadRoutes(app: express.Application) {
  app.post('/api/upload/virtual-tour/:propertyId', uploadVirtualTour);
  app.get('/api/upload/virtual-tour/progress/:jobId', sseTourProgress);
  // Register test FTP upload endpoints
  app.post('/api/upload/test-ftp', uploadTestFileToFTP);
  app.get('/api/upload/test-ftp/progress/:jobId', sseTestFtpProgress);
}

// Helper functions for file operations
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Function to extract a zip file
export async function extractTourZip(zipPath: string, propertyId: string): Promise<string> {
  try {
    console.log(`Extracting tour zip from ${zipPath} for property ${propertyId}`);
    const zip = new AdmZip(zipPath);

    // Create a directory for the extracted tour
    const extractDir = path.join(tourDir, `property_${propertyId}_tour`);

    // If the directory already exists, remove it
    if (fs.existsSync(extractDir)) {
      console.log(`Removing existing tour directory: ${extractDir}`);
      fs.rmSync(extractDir, { recursive: true, force: true });
    }

    // Create the directory
    console.log(`Creating tour directory: ${extractDir}`);
    await mkdirAsync(extractDir, { recursive: true });

    // Extract the zip file
    console.log('Extracting zip file...');
    zip.extractAllTo(extractDir, true);

    // List extracted files (for debugging)
    const files = fs.readdirSync(extractDir);
    console.log(`Extracted ${files.length} files/directories: `, files);

    // Check if index.htm or index.html file exists
    const indexFile = files.find(file => file.toLowerCase() === 'index.htm' || file.toLowerCase() === 'index.html') || 'index.html';
    if (!files.includes(indexFile)) {
      console.warn('Warning: No index.htm or index.html file found in the extracted tour');
    } else {
      console.log(`Found index file: ${indexFile}`);
    }

    // Upload the extracted directory to FTP
    console.log(`Uploading extracted tour to FTP for property ${propertyId}...`);
    await uploadTourDirToFTP(extractDir, propertyId);
    console.log(`Tour uploaded to FTP at: /tours/property_${propertyId}_tour`);

    // Delete the zip file to save space
    console.log(`Deleting zip file: ${zipPath}`);
    await unlinkAsync(zipPath);

    // Return the public FTP URL to the uploaded tour's index file
    return `https://${process.env.FTP_HOST}/tours/property_${propertyId}_tour/${indexFile}`;

  } catch (error) {
    console.error('Error extracting tour zip:', error);
    throw new Error('Failed to extract virtual tour files: ' + (error as Error).message);
  }
}

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