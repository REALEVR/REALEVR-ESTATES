/**
 * Checks and naming for 360 photos picked in the browser, so a bad file is explained the moment it is chosen instead of after a
 * long upload. The thresholds mirror the server's classifier (server/tour-media-classifier.ts), which stays the source of truth.
 */

export const PANO_MIN_RATIO = 1.9
export const PANO_MAX_RATIO = 2.15
export const PANO_MIN_WIDTH = 3000
/** Larger than any 360 camera still; stops a stray video or RAW file from being sent. */
export const PANO_MAX_BYTES = 120 * 1024 * 1024
export const PANO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface PanoVerdict {
    ok: boolean
    reason?: string
}

export function checkPanorama(info: { width: number; height: number; bytes: number; type: string; name?: string }): PanoVerdict {
    const { width, height, bytes, type } = info
    const name = info.name ?? ''
    const looksLikeImageByName = /\.(jpe?g|png|webp)$/i.test(name)
    if (!PANO_TYPES.includes(type) && !(type === '' && looksLikeImageByName)) {
        if (/heic|heif/i.test(type) || /\.hei[cf]$/i.test(name)) {
            return { ok: false, reason: 'HEIC photos are not supported. Export the 360 photo as JPG from your camera app.' }
        }
        return { ok: false, reason: 'Use a JPG, PNG or WebP photo.' }
    }
    if (bytes > PANO_MAX_BYTES) {
        return { ok: false, reason: `This file is ${Math.round(bytes / 1048576)} MB. Export it as a JPG under ${Math.round(PANO_MAX_BYTES / 1048576)} MB.` }
    }
    if (!width || !height) return { ok: false, reason: 'We could not read this picture. Try exporting it again.' }
    const ratio = width / height
    if (ratio < PANO_MIN_RATIO || ratio > PANO_MAX_RATIO) {
        return {
            ok: false,
            reason: `This is not a full 360 photo: a 360 photo is exactly twice as wide as it is tall, and this one is ${width}×${height}. For ordinary photos use "Phone capture".`,
        }
    }
    if (width < PANO_MIN_WIDTH) {
        return {
            ok: false,
            reason: `Too small for a 360 tour (${width} px wide). Export it at full resolution, at least ${PANO_MIN_WIDTH} px wide; most 360 cameras shoot 5000+.`,
        }
    }
    return { ok: true }
}

/** "IMG_20260314_101500_00_360.JPG" -> "Room" is useless; "living_room-360.jpg" -> "Living room" is what an agent named it. */
export function roomNameFromFilename(filename: string, taken: Iterable<string> = [], fallbackIndex = 1): string {
    const base = filename
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[_\-.]+/g, ' ')
        .replace(/\b(360|pano(rama)?|equirect(angular)?|insta360|theta|ricoh|vr|hdr|final|edit(ed)?|copy)\b/gi, ' ')
        .replace(/\b(img|dsc|pxl|mvimg|r\d{4,}|iso\d+)\b/gi, ' ')
        .replace(/\b\d{4,}\b/g, ' ') // camera counters and timestamps
        .replace(/\(\d+\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    // Nothing readable left (a camera's own counter like "IMG_..._00_360") means the agent never named it: number it instead.
    let name = base.length >= 2 && /[a-z]/i.test(base) ? base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() : `Room ${fallbackIndex}`
    const used = new Set(Array.from(taken, (n) => n.trim().toLowerCase()))
    if (!used.has(name.toLowerCase())) return name
    let n = 2
    while (used.has(`${name} ${n}`.toLowerCase())) n++
    return `${name} ${n}`
}

/** Same slug rule as the server (room-capture-types.ts), so the client can tell which uploaded room a name refers to. */
export function slugifyRoomName(name: string): string {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'room'
    )
}

/** Reads a picture's pixel size in the browser without decoding the whole thing into the page. */
export async function readImageSize(file: File): Promise<{ width: number; height: number }> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bmp = await createImageBitmap(file)
            const size = { width: bmp.width, height: bmp.height }
            bmp.close?.()
            return size
        } catch {
            // fall through to the <img> route
        }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight })
            URL.revokeObjectURL(url)
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('unreadable image'))
        }
        img.src = url
    })
}
