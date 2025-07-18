// const ftp = require("");

import ftp from "basic-ftp"
import path from "path"
import fs from "fs"

/**
 * Uploads a directory and its contents recursively to an FTP server under /tours/property_{propertyId}_tour
 * @param {string} localDir - Local directory to upload
 * @param {string} propertyId - Property ID for remote folder naming
 * @param {(percent: number, message: string) => void} [progressCb] - Optional progress callback
 * @returns {Promise<string>} - Remote FTP path
 */
async function uploadTourDirToFTP(localDir, propertyId, progressCb) {
    const client = new ftp.Client();
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: false // set to true if using FTPS
        });
        const remoteDir = `/tours/property_${propertyId}_tour`;
        await client.ensureDir(remoteDir);
        // Count total files
        const allFiles = [];
        function collectFiles(dir) {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const localPath = path.join(dir, item);
                if (fs.lstatSync(localPath).isDirectory()) {
                    collectFiles(localPath);
                } else {
                    allFiles.push(localPath);
                }
            }
        }
        collectFiles(localDir);
        let uploaded = 0;
        async function uploadDirRecursive(client, localDir, remoteDir) {
            const items = fs.readdirSync(localDir);
            for (const item of items) {
                const localPath = path.join(localDir, item);
                const remotePath = remoteDir + "/" + item;
                if (fs.lstatSync(localPath).isDirectory()) {
                    await client.ensureDir(remotePath);
                    await uploadDirRecursive(client, localPath, remotePath);
                } else {
                    await client.uploadFrom(localPath, remotePath);
                    uploaded++;
                    if (progressCb) {
                        const percent = Math.round((uploaded / allFiles.length) * 100);
                        progressCb(percent, `Uploading: ${item} (${uploaded}/${allFiles.length})`);
                    }
                }
            }
        }
        await uploadDirRecursive(client, localDir, remoteDir);
        return remoteDir;
    } finally {
        client.close();
    }
}

export { uploadTourDirToFTP };
