import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import fs from "fs";
import path from "path";

const firebaseConfig = {
  // apiKey: "AIzaSyBRIl0ATDL3eN1-fteya4nbv8RLEAdgm1o",
  // authDomain: "artworks-422fa.firebaseapp.com",
  // databaseURL: "https://artworks-422fa-default-rtdb.firebaseio.com",
  // projectId: "artworks-422fa",
  // storageBucket: "artworks-422fa.appspot.com",
  // messagingSenderId: "401262057267",
  // appId: "1:401262057267:web:5f26a73d81fe9b53531046",
  // measurementId: "G-5W9XRXM80N"

  apiKey: "AIzaSyAZpLNyS9RN7BN6eAcD5AvHmgKBi-eYfmA",
  authDomain: "moxiescreen.firebaseapp.com",
  databaseURL: "https://moxiescreen-default-rtdb.firebaseio.com",
  projectId: "moxiescreen",
  storageBucket: "moxiescreen.appspot.com",
  messagingSenderId: "346104076821",
  appId: "1:346104076821:web:fe8a90f12720aeb448cc1c",
  measurementId: "G-NCQ7HLV0D0"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export async function uploadFolderToFirebase(localFolderPath: string, remoteFolderPath: string) {
  const files = fs.readdirSync(localFolderPath);
  const uploads = [];

  for (const file of files) {
    const localFilePath = path.join(localFolderPath, file);
    const stats = fs.statSync(localFilePath);

    if (stats.isDirectory()) {
      uploads.push(...await uploadFolderToFirebase(localFilePath, `${remoteFolderPath}/${file}`));
    } else {
      const fileRef = ref(storage, `${remoteFolderPath}/${file}`);
      const fileContent = fs.readFileSync(localFilePath);
      await uploadBytes(fileRef, fileContent);
      const downloadURL = await getDownloadURL(fileRef);
      uploads.push({ file, url: downloadURL });
    }
  }

  return uploads;
}

export async function uploadTourToFirebase(extractedFolderPath: string, propertyId: string): Promise<string> {
  try {
    const remoteFolderPath = `tours/property_${propertyId}`;
    
    // Find index file
    const findIndexFile = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
          return path.relative(extractedFolderPath, fullPath).replace(/\\/g, '/');
        } else if (entry.isDirectory()) {
          const found = findIndexFile(fullPath);
          if (found) return path.join(entry.name, found).replace(/\\/g, '/');
        }
      }
      return null;
    };

    const indexFile = findIndexFile(extractedFolderPath) || 'index.html';
    await uploadFolderToFirebase(extractedFolderPath, remoteFolderPath);
    
    const indexRef = ref(storage, `${remoteFolderPath}/${indexFile}`);
    return await getDownloadURL(indexRef);

  } catch (error: any) {
    console.error('Firebase upload error:', error);
    throw new Error(`Failed to upload tour to Firebase: ${error.message}`);
  }
}