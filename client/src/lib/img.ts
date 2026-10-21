/**
 * Small copies of our own photos (server/image-resize.ts). Photos hosted anywhere else are left alone, because the server
 * only resizes pictures that belong to this site.
 */
export const CARD_WIDTHS = [240, 360, 480, 720, 960] as const

/** True for the pictures the server can resize: files under /uploads/images and the site's S3 bucket. */
export function isResizable(src: string | null | undefined): src is string {
    if (!src) return false
    if (src.startsWith('/uploads/images/')) return true
    return /^https:\/\/[\w.-]+\.s3\.[\w-]+\.amazonaws\.com\//.test(src)
}

export function resizedSrc(src: string, width: number): string {
    return `/api/img?src=${encodeURIComponent(src)}&w=${width}`
}

export function resizedSrcSet(src: string, widths: readonly number[] = CARD_WIDTHS): string {
    return widths.map((w) => `${resizedSrc(src, w)} ${w}w`).join(', ')
}
