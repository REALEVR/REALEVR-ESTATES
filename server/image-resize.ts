/**
 * Small copies of listing photos for phones. A card on a phone is ~360 px wide, but the stored photo is the camera
 * original (often 1-4 MB). GET /api/img?src=<photo>&w=480 returns the same picture as a ~30-60 KB WebP.
 *
 * Only photos that already belong to this site are resized: files under /uploads/images and files in the site's own S3
 * bucket. Anything else is refused, so the route cannot be used to fetch arbitrary addresses on someone's behalf.
 * Results are cached on disk by (source, width); the browser and any CDN may keep them for a year because a changed photo
 * has a new address.
 */
import type { Express, Request, Response } from 'express'
import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'

export const IMAGE_WIDTHS = [240, 360, 480, 720, 960, 1280] as const
const MAX_SOURCE_BYTES = 30 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000
const QUALITY = 74

const CACHE_DIR = path.join(os.tmpdir(), 'realevr-img-cache')
const LOCAL_IMAGES = path.join(process.cwd(), 'uploads', 'images')

/** Hosts whose photos we may fetch: the configured bucket and the production one. */
function allowedHosts(): Set<string> {
    const hosts = new Set<string>(['realevr-tours.s3.eu-north-1.amazonaws.com'])
    const bucket = process.env.AWS_S3_BUCKET_NAME
    const region = process.env.AWS_REGION
    if (bucket && region) hosts.add(`${bucket}.s3.${region}.amazonaws.com`)
    return hosts
}

type Source = { kind: 'local'; file: string } | { kind: 'remote'; url: string }

/** Decide whether `src` is one of our own photos; null when it is not (or tries to escape the images folder). */
export function resolveSource(src: string): Source | null {
    if (src.startsWith('/uploads/images/')) {
        const rel = decodeURIComponent(src.slice('/uploads/images/'.length)).split('?')[0]
        const file = path.resolve(LOCAL_IMAGES, rel)
        if (!file.startsWith(LOCAL_IMAGES + path.sep)) return null
        return { kind: 'local', file }
    }
    try {
        const u = new URL(src)
        if (u.protocol !== 'https:' || !allowedHosts().has(u.hostname)) return null
        return { kind: 'remote', url: u.toString() }
    } catch {
        return null
    }
}

function nearestWidth(w: number): number {
    return IMAGE_WIDTHS.find((x) => x >= w) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]
}

async function loadBytes(source: Source): Promise<Buffer> {
    if (source.kind === 'local') return fs.promises.readFile(source.file)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    try {
        const res = await fetch(source.url, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`source answered ${res.status}`)
        const declared = Number(res.headers.get('content-length') ?? 0)
        if (declared > MAX_SOURCE_BYTES) throw new Error('source too large')
        const bytes = Buffer.from(await res.arrayBuffer())
        if (bytes.length > MAX_SOURCE_BYTES) throw new Error('source too large')
        return bytes
    } finally {
        clearTimeout(timer)
    }
}

export function registerImageResizeRoute(app: Express): void {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const inflight = new Map<string, Promise<void>>()

    app.get('/api/img', async (req: Request, res: Response) => {
        const src = String(req.query.src ?? '')
        const width = nearestWidth(Math.max(1, Math.min(2000, Number(req.query.w) || 480)))
        const source = src ? resolveSource(src) : null
        if (!source) return res.status(400).json({ message: 'That picture cannot be resized here.' })

        const key = createHash('sha1').update(`${src}|${width}`).digest('hex')
        const cached = path.join(CACHE_DIR, `${key}.webp`)
        try {
            if (!fs.existsSync(cached)) {
                let job = inflight.get(key)
                if (!job) {
                    job = (async () => {
                        const bytes = await loadBytes(source)
                        const out = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer()
                        await fs.promises.writeFile(`${cached}.tmp`, out)
                        await fs.promises.rename(`${cached}.tmp`, cached)
                    })().finally(() => inflight.delete(key))
                    inflight.set(key, job)
                }
                await job
            }
            res.setHeader('Content-Type', 'image/webp')
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            res.setHeader('Vary', 'Accept-Encoding')
            fs.createReadStream(cached).pipe(res)
        } catch (err) {
            console.warn('[img] could not resize', src, (err as Error)?.message)
            // The page falls back to the original picture on any error, so a broken source is not fatal.
            res.status(502).json({ message: 'Could not prepare that picture.' })
        }
    })
}
