import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
    cloud_name: 'dnemgxfwh',
    api_key: '452781244654595',
    api_secret: 'BsW4-BLzWZRMh8_EeUVHAafwdv0'
});

/**
 * Uploads an entire folder to Cloudinary.
 * @param {string} localFolderPath - The local path of the folder to upload.
 * @param {string} cloudinaryFolderPath - The target folder path in Cloudinary.
 * @param {(progress: number) => void} progressCallback - A callback to report progress.
 * @returns {Promise<any>} - The upload result for the index.html file.
 */
async function uploadFolder(localFolderPath: string, cloudinaryFolderPath: string, progressCallback: (progress: number) => void) {
    const files = fs.readdirSync(localFolderPath);
    const totalFiles = files.length;
    let uploadedFiles = 0;
    let indexHtmlResult = null;

    for (const file of files) {
        const localFilePath = path.join(localFolderPath, file);
        const stats = fs.statSync(localFilePath);

        if (stats.isDirectory()) {
            const result = await uploadFolder(localFilePath, `${cloudinaryFolderPath}/${file}`, (progress) => {
                // This is not perfect, but it gives some sense of progress
                progressCallback(uploadedFiles / totalFiles + progress / totalFiles);
            });
            if (result) {
                indexHtmlResult = result;
            }
        } else {
            const result = await cloudinary.uploader.upload(localFilePath, {
                folder: cloudinaryFolderPath,
                resource_type: 'auto',
                use_filename: true,
                unique_filename: false,
            });
            uploadedFiles++;
            progressCallback(uploadedFiles / totalFiles);
            if (file.toLowerCase() === 'index.html' || file.toLowerCase() === 'index.htm') {
                indexHtmlResult = result;
            }
        }
    }

    return indexHtmlResult;
}

/**
 * Uploads an extracted tour folder to Cloudinary and returns a viewable URL.
 * @param {string} extractedFolderPath - The path to the extracted tour folder.
 * @param {string} propertyId - The ID of the property.
 * @param {(progress: number) => void} progressCallback - A callback to report progress.
 * @returns {Promise<string>} - The viewable URL of the tour's index.html.
 */
export async function uploadTourToCloudinary(extractedFolderPath: string, propertyId: string, progressCallback: (progress: number) => void): Promise<string> {
    try {
        const cloudinaryFolderPath = `tours/property_${propertyId}`;

        const indexHtmlResult = await uploadFolder(extractedFolderPath, cloudinaryFolderPath, progressCallback);

        if (!indexHtmlResult) {
            throw new Error('index.html not found in the uploaded tour folder.');
        }

        // The viewable URL for a raw file is constructed manually.
        const tourUrl = `https://res.cloudinary.com/${cloudinary.config().cloud_name}/raw/upload/v${indexHtmlResult.version}/${indexHtmlResult.public_id}`;

        return tourUrl;

    } catch (error) {
        console.error('Cloudinary upload error:', JSON.stringify(error, null, 2));
        throw new Error('Failed to upload tour to Cloudinary.');
    }
}
