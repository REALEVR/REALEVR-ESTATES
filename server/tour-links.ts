/**
 * Connecting the rooms of a phone-captured tour.
 *
 * Each room of a generated tour is its own 360 photo. A "link" is a doorway
 * (or arrow) the visitor sees inside one panorama that leads to another room:
 * where it sits (yaw/pitch in degrees, as seen from the panorama's centre),
 * and which room it goes to. The viewer (server/templates/tour-viewer) draws a
 * blinking hotspot there and, on hover or tap, a small preview of the room
 * behind it.
 *
 * Links live in the published tour's own tour.json in S3, so editing them
 * needs no re-capture and no re-upload of the photos. Saving also works out two
 * things the viewer needs so it does no work at runtime:
 *   - arrivalYaw: which way to face on arriving. If the destination has a door
 *     back to where you came from, you arrive looking away from it (as you
 *     would walking through a real door); otherwise you face its default view.
 *   - thumb: a small crop of the destination as you will first see it.
 */
import sharp from 'sharp';
import type { Request, Response } from 'express';
import { storage } from './storage';
import {
  NotAGeneratedTourError,
  readTourObject,
  resolveGeneratedTourFolder,
  writeTourObject,
} from './s3-tour-hosting';
import type { TourRoomLink } from './room-capture-types';

const MAX_LINKS_PER_ROOM = 8;
const THUMB_WIDTH_PX = 480;
const THUMB_FIELD_OF_VIEW_DEG = 110;

interface TourRoom {
  slug: string;
  name: string;
  mode: 'panorama' | 'gallery';
  panoUrl?: string;
  links?: TourRoomLink[];
  [key: string]: unknown;
}
interface TourFile {
  title?: string;
  rooms: TourRoom[];
  [key: string]: unknown;
}

/** Degrees into [-180, 180). */
export function normalizeYaw(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/** What the editor sends: only where the door is and where it leads. */
export interface LinkInput {
  to: string;
  yaw: number;
  pitch: number;
}

/**
 * Turn whatever the client sent into a clean per-room link list, or throw a
 * message fit to show the user. Gallery (photo sweep) rooms cannot have doors,
 * there is no panorama to place them in; every destination must be a room of
 * this tour, never the room itself, and at most once per room.
 */
export function sanitizeLinks(input: unknown, rooms: TourRoom[]): Record<string, LinkInput[]> {
  if (!input || typeof input !== 'object') throw new Error('links must be an object of room → doors.');
  const bySlug = new Map(rooms.map((r) => [r.slug, r]));
  const clean: Record<string, LinkInput[]> = {};
  for (const [slug, raw] of Object.entries(input as Record<string, unknown>)) {
    const room = bySlug.get(slug);
    if (!room) throw new Error(`Unknown room "${slug}".`);
    if (!Array.isArray(raw)) throw new Error(`Doors for "${slug}" must be a list.`);
    if (raw.length === 0) continue;
    if (room.mode !== 'panorama') throw new Error(`"${room.name}" is a photo set, not a 360 view, so it cannot have doors.`);
    if (raw.length > MAX_LINKS_PER_ROOM) throw new Error(`"${room.name}" has too many doors (max ${MAX_LINKS_PER_ROOM}).`);
    const seen = new Set<string>();
    clean[slug] = raw.map((item: any) => {
      const to = String(item?.to ?? '');
      const yaw = Number(item?.yaw);
      const pitch = Number(item?.pitch);
      if (!bySlug.has(to) || to === slug) throw new Error(`A door in "${room.name}" points to a room that does not exist.`);
      if (seen.has(to)) throw new Error(`"${room.name}" has two doors to the same room.`);
      seen.add(to);
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error('A door has an invalid position.');
      return {
        to,
        yaw: Math.round(normalizeYaw(yaw) * 10) / 10,
        pitch: Math.round(Math.max(-80, Math.min(80, pitch)) * 10) / 10,
      };
    });
  }
  return clean;
}

/** Which way to face in `to` when arriving from `from` (degrees). */
export function arrivalYawFor(from: string, to: string, links: Record<string, LinkInput[]>): number {
  const back = (links[to] ?? []).find((l) => l.to === from);
  return back ? Math.round(normalizeYaw(back.yaw + 180) * 10) / 10 : 0;
}

/** A small, roughly 4:3 crop of an equirectangular panorama around `yawDeg`. */
export async function cropPanoramaThumb(pano: Buffer, yawDeg: number): Promise<Buffer> {
  const meta = await sharp(pano).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('Could not read the panorama size.');
  const cropW = Math.max(16, Math.round((W * THUMB_FIELD_OF_VIEW_DEG) / 360));
  const cropH = Math.min(H, Math.round(cropW * 0.75));
  const top = Math.max(0, Math.min(H - cropH, Math.round(H / 2 - cropH / 2)));
  // Yaw 0 is the middle of the image and yaw grows to the right.
  const centre = Math.round((normalizeYaw(yawDeg) / 360 + 0.5) * W);
  let left = centre - Math.round(cropW / 2);
  left = ((left % W) + W) % W;

  let cropped: Buffer;
  if (left + cropW <= W) {
    cropped = await sharp(pano).extract({ left, top, width: cropW, height: cropH }).toBuffer();
  } else {
    // The crop straddles the image's left/right edge (the 360° seam): stitch the two halves.
    const firstW = W - left;
    const a = await sharp(pano).extract({ left, top, width: firstW, height: cropH }).toBuffer();
    const b = await sharp(pano).extract({ left: 0, top, width: cropW - firstW, height: cropH }).toBuffer();
    cropped = await sharp({ create: { width: cropW, height: cropH, channels: 3, background: '#000' } })
      .composite([
        { input: a, left: 0, top: 0 },
        { input: b, left: firstW, top: 0 },
      ])
      .png()
      .toBuffer();
  }
  return sharp(cropped).resize({ width: THUMB_WIDTH_PX }).jpeg({ quality: 74, mozjpeg: true }).toBuffer();
}

// ---------------------------------------------------------------------------

type LoadedTour =
  | { ok: false; status: number; message: string }
  | { ok: true; propertyId: number; folder: string; tour: TourFile };

async function loadOwnedTour(req: Request, propertyIdRaw: string): Promise<LoadedTour> {
  const fail = (status: number, message: string): LoadedTour => ({ ok: false, status, message });
  const user = req.user as { id: number; role: string } | undefined;
  const propertyId = parseInt(propertyIdRaw, 10);
  if (!user || !Number.isSafeInteger(propertyId)) return fail(400, 'Bad request.');
  const property = await storage.getProperty(propertyId);
  if (!property) return fail(404, 'Property not found.');
  if (user.role !== 'admin' && property.ownerId !== user.id) {
    return fail(403, 'You can only connect rooms on your own properties.');
  }
  if (!property.tourUrl) return fail(404, 'This property has no virtual tour yet.');
  let folder: string;
  try {
    folder = resolveGeneratedTourFolder(property.tourUrl, String(propertyId));
  } catch (err) {
    if (err instanceof NotAGeneratedTourError) {
      return fail(409, 'Rooms can only be connected on tours captured with the phone flow.');
    }
    throw err;
  }
  const raw = await readTourObject(`${folder}tour.json`);
  if (!raw) return fail(409, 'Rooms can only be connected on tours captured with the phone flow.');
  const tour = JSON.parse(raw.toString('utf8')) as TourFile;
  if (!Array.isArray(tour.rooms)) return fail(409, 'This tour has no rooms.');
  return { ok: true, propertyId, folder, tour };
}

/** GET: can this property's tour have its rooms connected, and how are they linked now? */
export async function getTourLinks(req: Request, res: Response) {
  try {
    const loaded = await loadOwnedTour(req, req.params.propertyId);
    if (!loaded.ok) return res.json({ editable: false, reason: loaded.message });
    const panoramas = loaded.tour.rooms.filter((r) => r.mode === 'panorama');
    res.json({
      editable: panoramas.length >= 2,
      reason: panoramas.length >= 2 ? undefined : 'At least two 360 rooms are needed to connect them.',
      rooms: loaded.tour.rooms.map((r) => ({ slug: r.slug, name: r.name, mode: r.mode, links: r.links ?? [] })),
    });
  } catch (err: any) {
    console.error('[tour-links] GET failed:', err);
    res.status(500).json({ message: 'Failed to load the tour.' });
  }
}

/** PUT: save the doors between rooms and rebuild what the viewer needs for them. */
export async function saveTourLinks(req: Request, res: Response) {
  try {
    const loaded = await loadOwnedTour(req, req.params.propertyId);
    if (!loaded.ok) return res.status(loaded.status).json({ status: 'error', message: loaded.message });
    const { folder, tour } = loaded;

    let links: Record<string, LinkInput[]>;
    try {
      links = sanitizeLinks(req.body?.links, tour.rooms);
    } catch (err: any) {
      return res.status(400).json({ status: 'error', message: err.message });
    }

    const roomBySlug = new Map(tour.rooms.map((r) => [r.slug, r]));
    const panoCache = new Map<string, Buffer | null>();
    const getPano = async (slug: string) => {
      if (!panoCache.has(slug)) {
        const url = roomBySlug.get(slug)?.panoUrl;
        panoCache.set(slug, url && !url.includes('..') ? await readTourObject(`${folder}${url}`) : null);
      }
      return panoCache.get(slug) ?? null;
    };

    let linkCount = 0;
    for (const room of tour.rooms) {
      const mine = links[room.slug] ?? [];
      const built: TourRoomLink[] = [];
      for (const link of mine) {
        const arrivalYaw = arrivalYawFor(room.slug, link.to, links);
        const entry: TourRoomLink = { to: link.to, yaw: link.yaw, pitch: link.pitch, arrivalYaw };
        // The file name carries the arrival direction, so a changed door gets a new
        // thumbnail under a new name (these files are cached for a year).
        const thumbKey = `thumbs/${link.to}-${Math.round(((arrivalYaw % 360) + 360) % 360)}.jpg`;
        const pano = await getPano(link.to);
        if (pano) {
          try {
            await writeTourObject(`${folder}${thumbKey}`, await cropPanoramaThumb(pano, arrivalYaw), 'image/jpeg', 'public, max-age=31536000');
            entry.thumb = thumbKey;
          } catch (err) {
            console.warn(`[tour-links] could not build a preview for ${link.to} (the door still works):`, err);
          }
        }
        built.push(entry);
        linkCount++;
      }
      if (built.length) room.links = built;
      else delete room.links;
    }

    tour.generatedAt = tour.generatedAt ?? new Date().toISOString();
    tour.linksUpdatedAt = new Date().toISOString();
    await writeTourObject(`${folder}tour.json`, JSON.stringify(tour, null, 2), 'application/json', 'no-cache');

    res.json({ status: 'success', links: linkCount });
  } catch (err: any) {
    console.error('[tour-links] PUT failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to save the doors. Please try again.' });
  }
}
