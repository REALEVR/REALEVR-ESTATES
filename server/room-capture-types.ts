export type RoomCaptureKind = 'equirect_photo' | 'equirect_video' | 'photo_sweep' | 'walkthrough_video';

export type RoomStatus = 'qualified' | 'needs_retake';

export interface RoomAsset {
  /** Path relative to the draft directory, e.g. "rooms/living-room/photo_01.jpg" */
  relPath: string;
}

export interface RoomEntry {
  slug: string;
  name: string;
  kind: RoomCaptureKind;
  status: RoomStatus;
  assets: RoomAsset[];
  warnings: string[];
  rejectionReasons: string[];
  updatedAt: string;
}

export interface DraftManifest {
  propertyId: string;
  createdAt: string;
  updatedAt: string;
  rooms: RoomEntry[];
}

export const MIN_QUALIFYING_ROOMS_DEFAULT = 1;
export const RECOMMENDED_QUALIFYING_ROOMS = 3;

export function slugifyRoomName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'room';
}
