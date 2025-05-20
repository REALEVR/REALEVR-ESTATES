import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { nanoid } from 'nanoid';
import AdmZip from 'adm-zip';

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

// Define upload middleware
export const uploadPropertyImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image file.') as any);
    }
  }
}).single('image');

export const uploadVirtualTour = multer({
  storage: tourStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit for tour zip files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.mimetype === 'application/octet-stream' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Not a zip file! Please upload a zip file containing your virtual tour.') as any);
    }
  }
}).single('tourZip');

// Helper functions for file operations
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Function to extract a zip file
export async function extractTourZip(zipPath: string, propertyId: number): Promise<string> {
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

    // Check if index.htm file exists
    const indexFile = files.find(file => file.toLowerCase() === 'index.htm');
    if (!indexFile) {
      console.warn('Warning: No index.htm file found in the extracted tour');
    } else {
      console.log(`Found index file: ${indexFile}`);
    }

    // Delete the zip file to save space
    console.log(`Deleting zip file: ${zipPath}`);
    await unlinkAsync(zipPath);

    // Return the path to the extracted tour directory
    const relativePath = path.relative(process.cwd(), extractDir);
    console.log(`Tour extraction complete. Relative path: ${relativePath}`);
    return relativePath;

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