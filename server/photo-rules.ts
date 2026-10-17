/**
 * Rules for the cover photo of a listing: it must be a real photograph, big enough to look good, with no text or logo
 * written over it. (The sample BnB listing once shipped an AI-made coin illustration with its title baked in.)
 *
 * The cheap checks (format, size, shape, "is this a flat graphic?") always run. A vision check asks Gemini whether the picture
 * is a photograph and whether text is laid over it; it only ever blocks on a clear "no" and never when Gemini is down or busy,
 * so an outage cannot stop anyone listing a home. Set PHOTO_AI_CHECK=0 to switch it off.
 */
import sharp from 'sharp'
import { getGeminiClient } from './lib/gemini'
import { geminiModelCandidates, isProviderResting } from './gene/ai-provider'

export const COVER_RULES = {
    formats: ['jpeg', 'png', 'webp'],
    minLongEdge: 1000,
    minShortEdge: 450,
    maxAspect: 3,
    minBytes: 30_000,
    /** A photo has hundreds of distinct colours at 4 bits per channel; a flat illustration has a few dozen. */
    minDistinctColours: 40,
    visionTimeoutMs: 7000,
} as const

export interface PhotoVerdict {
    ok: boolean
    reason?: string
}

export interface VisionAnswer {
    photograph: boolean | null
    overlaidText: boolean | null
}

export type VisionCheck = (buffer: Buffer) => Promise<VisionAnswer>

/** Thrown from the upload chain so the route answers with the reason, not a generic failure. */
export class PhotoRuleError extends Error {
    status = 422
}

/** A listing needs a real cover before it can take a featured or boosted slot. */
export function hasCoverPhoto(property: { imageUrl?: string | null }): boolean {
    return typeof property.imageUrl === 'string' && property.imageUrl.trim().length > 0
}

async function distinctColours(buffer: Buffer): Promise<number> {
    const { data } = await sharp(buffer).resize(96, 96, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const seen = new Set<number>()
    for (let i = 0; i + 2 < data.length; i += 3) seen.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4))
    return seen.size
}

const VISION_PROMPT =
    'Look at this picture, which someone wants to use as the cover photo of a home listing. Answer ONLY with JSON: ' +
    '{"photograph": true if it is a real camera photograph of a place (not an illustration, render, icon, poster or AI drawing), ' +
    '"overlaidText": true if words, a title, a price, a logo or a watermark are written over the picture (signs or house numbers that are part of the scene do not count)}'

/** Asks Gemini; returns nulls (no opinion) whenever it cannot answer. */
export const geminiVisionCheck: VisionCheck = async (buffer) => {
    const none: VisionAnswer = { photograph: null, overlaidText: null }
    if (process.env.PHOTO_AI_CHECK === '0') return none
    const ai = getGeminiClient()
    if (!ai || isProviderResting('gemini')) return none
    try {
        const small = await sharp(buffer).resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()
        const ask = async () => {
            for (const model of geminiModelCandidates()) {
                try {
                    const response = await ai.models.generateContent({
                        model,
                        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } }, { text: VISION_PROMPT }] }],
                        config: { responseMimeType: 'application/json', maxOutputTokens: 120 },
                    })
                    const parsed = JSON.parse((response.text || '').trim())
                    return {
                        photograph: typeof parsed.photograph === 'boolean' ? parsed.photograph : null,
                        overlaidText: typeof parsed.overlaidText === 'boolean' ? parsed.overlaidText : null,
                    } as VisionAnswer
                } catch (err) {
                    if (Number((err as { status?: number })?.status) !== 404) throw err // a retired model: try the next one
                }
            }
            return none
        }
        return await Promise.race([ask(), new Promise<VisionAnswer>((resolve) => setTimeout(() => resolve(none), COVER_RULES.visionTimeoutMs))])
    } catch (err) {
        console.error('[photo-rules] vision check skipped:', (err as Error)?.message ?? err)
        return none
    }
}

export async function checkCoverPhoto(buffer: Buffer, options: { vision?: VisionCheck | false } = {}): Promise<PhotoVerdict> {
    let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
    try {
        meta = await sharp(buffer).metadata()
    } catch {
        return { ok: false, reason: "We couldn't read that file as a photo. Please upload a JPG, PNG or WebP picture." }
    }
    if (!meta.format || !(COVER_RULES.formats as readonly string[]).includes(meta.format)) {
        return { ok: false, reason: 'Please upload a JPG, PNG or WebP photo (not a GIF, SVG or other format).' }
    }
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    const long = Math.max(width, height)
    const short = Math.min(width, height)
    if (long < COVER_RULES.minLongEdge || short < COVER_RULES.minShortEdge || buffer.length < COVER_RULES.minBytes) {
        return {
            ok: false,
            reason: `This photo is too small (${width}×${height}). Use the original from your camera: at least ${COVER_RULES.minLongEdge} px on the long side and ${COVER_RULES.minShortEdge} px on the short side.`,
        }
    }
    if (long / Math.max(short, 1) > COVER_RULES.maxAspect) {
        return { ok: false, reason: 'This photo is too long and thin to work as a cover. Please use a normal landscape or portrait photo.' }
    }
    if ((await distinctColours(buffer)) < COVER_RULES.minDistinctColours) {
        return { ok: false, reason: 'This looks like a graphic or illustration, not a photograph. Please upload a real photo of the property.' }
    }

    const vision = options.vision === false ? null : (options.vision ?? geminiVisionCheck)
    if (vision) {
        const answer = await vision(buffer)
        if (answer.photograph === false) {
            return { ok: false, reason: 'This looks like an illustration or render, not a photograph. Please upload a real photo of the property.' }
        }
        if (answer.overlaidText === true) {
            return { ok: false, reason: 'This photo has text or a logo written over it. Please upload the plain photo without any words on it.' }
        }
    }
    return { ok: true }
}
