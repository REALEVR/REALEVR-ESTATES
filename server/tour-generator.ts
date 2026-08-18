/**
 * Assembles a completed room-capture draft manifest into the same
 * on-disk directory shape that the existing `uploadTourToS3`
 * (server/s3-tour-hosting.ts) already knows how to walk and publish --
 * so a self-service, agent-captured tour is hosted through the exact
 * same pipeline as a professionally-authored 3D Vista export, and the
 * viewer components (client/src/components/property/VirtualTour.tsx,
 * SRBS's VRTourViewer.tsx) need zero changes: both just <iframe> the
 * resulting tourUrl.
 *
 * Output shape:
 *   <extractDir>/
 *     index.html          (from server/templates/generated-tour.html)
 *     tour.json            (scene graph consumed by index.html at runtime)
 *     panos/<slug>.jpg            (one equirectangular image per "panorama" room)
 *     rooms/<slug>/photo_NN.jpg    (ordered photo set per "gallery" room)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { DraftManifest, RoomEntry } from './room-capture-types';

// `__dirname` doesn't exist in ESM (this file compiles/bundles to an ES
// module — see package.json's "type": "module" — which is what crashed
// production on boot: "ReferenceError: __dirname is not defined in ES
// module scope"). This is the standard ESM equivalent.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'generated-tour.html');

interface TourJsonRoom {
  slug: string;
  name: string;
  mode: 'panorama' | 'gallery';
  qualityTier: 'equirect_360' | 'photo_sweep_lite';
  panoUrl?: string;
  photos?: string[];
}

interface GenerateResult {
  extractDir: string;
  roomCount: number;
  tourJson: { title: string; generatedAt: string; rooms: TourJsonRoom[] };
}

async function normalizeToPanorama(srcPath: string, destPath: string): Promise<void> {
  // Re-encode to a consistent max width and JPEG quality; keeps output
  // predictable regardless of source camera resolution/format.
  await sharp(srcPath)
    .resize({ width: 6000, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(destPath);
}

async function normalizeToGalleryPhoto(srcPath: string, destPath: string): Promise<void> {
  await sharp(srcPath)
    .resize({ width: 2400, withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(destPath);
}

export async function generateTourFromManifest(
  manifest: DraftManifest,
  draftDir: string,
  extractDir: string,
  propertyTitle: string
): Promise<GenerateResult> {
  const qualifiedRooms = manifest.rooms.filter((r) => r.status === 'qualified' && r.assets.length > 0);
  if (qualifiedRooms.length === 0) {
    throw new Error('No qualified rooms to build a tour from');
  }

  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(extractDir, 'panos'), { recursive: true });
  fs.mkdirSync(path.join(extractDir, 'rooms'), { recursive: true });

  const tourJsonRooms: TourJsonRoom[] = [];

  for (const room of qualifiedRooms) {
    tourJsonRooms.push(await materializeRoom(room, draftDir, extractDir));
  }

  const tourJson = {
    title: propertyTitle,
    generatedAt: new Date().toISOString(),
    rooms: tourJsonRooms,
  };
  fs.writeFileSync(path.join(extractDir, 'tour.json'), JSON.stringify(tourJson, null, 2));

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const html = template.split('{{TOUR_TITLE}}').join(escapeHtml(propertyTitle));
  fs.writeFileSync(path.join(extractDir, 'index.html'), html);

  return { extractDir, roomCount: tourJsonRooms.length, tourJson };
}

async function materializeRoom(room: RoomEntry, draftDir: string, extractDir: string): Promise<TourJsonRoom> {
  const isPanorama = room.kind === 'equirect_photo' || room.kind === 'equirect_video';

  if (isPanorama) {
    const srcPath = path.join(draftDir, room.assets[0].relPath);
    const destRel = path.join('panos', `${room.slug}.jpg`);
    await normalizeToPanorama(srcPath, path.join(extractDir, destRel));
    return {
      slug: room.slug,
      name: room.name,
      mode: 'panorama',
      qualityTier: 'equirect_360',
      panoUrl: destRel.replace(/\\/g, '/'),
    };
  }

  const photos: string[] = [];
  const roomDir = path.join('rooms', room.slug);
  fs.mkdirSync(path.join(extractDir, roomDir), { recursive: true });
  for (let i = 0; i < room.assets.length; i++) {
    const srcPath = path.join(draftDir, room.assets[i].relPath);
    const destRel = path.join(roomDir, `photo_${String(i + 1).padStart(2, '0')}.jpg`);
    await normalizeToGalleryPhoto(srcPath, path.join(extractDir, destRel));
    photos.push(destRel.replace(/\\/g, '/'));
  }
  return {
    slug: room.slug,
    name: room.name,
    mode: 'gallery',
    qualityTier: 'photo_sweep_lite',
    photos,
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
