/**
 * GENE Platform — lets the AI "read" an uploaded virtual-tour ZIP.
 *
 * Hooked into server/upload.ts's uploadVirtualTour, right after a tour ZIP
 * finishes extracting: samples a handful of the largest images inside the
 * extracted tour (3D Vista exports bundle panorama photos alongside many
 * small UI/hotspot icons - size is a cheap, reliable enough signal for
 * "this is probably a real photo, not a nav sprite"), sends them to
 * Gemini's vision model, and appends what it sees to the property's own
 * description field.
 *
 * WHY THIS IS "adding it to the SEOs" (per the ask): this app's SEO — page
 * title, meta description, Open Graph tags, JSON-LD (shared/seo.ts,
 * consumed by both server/social-preview.ts and the client's PageSeo) —
 * already derives entirely from the property's own fields, description
 * chief among them. There's no separate "SEO description" field to fill
 * in; enriching `property.description` with real, visually-grounded detail
 * is what enriches the SEO, automatically, everywhere that already reads it.
 *
 * Best-effort and additive only: never overwrites an existing description,
 * never invents facts (room counts, price, anything not visibly in an
 * image), and any failure (no Gemini key configured, a corrupt image, a
 * network error) just means this step quietly does nothing - it never
 * fails the tour upload itself.
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getGeminiClient } from '../lib/gemini'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
// 3D Vista exports are full of small hotspot/nav-icon PNGs alongside the
// actual panorama/room photos - this floor is a cheap way to skip the
// former without needing to open every file just to check its dimensions.
const MIN_CANDIDATE_BYTES = 40 * 1024
const MAX_IMAGES_TO_ANALYZE = 5
const RESIZE_MAX_DIMENSION = 768

function collectImageFiles(dir: string, out: { path: string; size: number }[] = []): { path: string; size: number }[] {
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return out
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            collectImageFiles(full, out)
        } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            try {
                const { size } = fs.statSync(full)
                if (size >= MIN_CANDIDATE_BYTES) out.push({ path: full, size })
            } catch {
                // Unreadable file - just skip it, not worth failing the whole scan over.
            }
        }
    }
    return out
}

/**
 * Best-effort: looks at a handful of the largest images inside an extracted
 * virtual-tour directory and asks Gemini's vision model to note distinctive,
 * purely visual details worth mentioning in a listing. Returns null (never
 * throws) if Gemini isn't configured, no suitable images were found, or the
 * call itself fails.
 */
export async function describeTourVisualHighlights(extractDir: string): Promise<string | null> {
    const ai = getGeminiClient()
    if (!ai) return null

    const candidates = collectImageFiles(extractDir)
    if (candidates.length === 0) return null

    candidates.sort((a, b) => b.size - a.size)
    const chosen = candidates.slice(0, MAX_IMAGES_TO_ANALYZE)

    const parts: any[] = [
        {
            text:
                "These are photos extracted from a real estate property's virtual tour. " +
                'In 2-3 sentences, note distinctive, purely visual details worth mentioning in a listing ' +
                '(finishes, natural light, layout impressions, notable fixtures or amenities actually visible). ' +
                'Do not guess room counts, price, or anything not visible in the images. ' +
                'Do not use markdown or headings. Return only the sentences, nothing else.',
        },
    ]

    for (const candidate of chosen) {
        try {
            const resized = await sharp(candidate.path)
                .resize(RESIZE_MAX_DIMENSION, RESIZE_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toBuffer()
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: resized.toString('base64') } })
        } catch (err) {
            console.error(`[gene/tour-vision] failed to prepare image ${candidate.path}:`, err)
        }
    }

    if (parts.length <= 1) return null // no images actually made it through preparation

    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: parts })
        const text = (response.text || '').trim()
        return text || null
    } catch (err) {
        console.error('[gene/tour-vision] Gemini vision call failed:', err)
        return null
    }
}

/**
 * Runs describeTourVisualHighlights and, if it returns something, appends it
 * to the property's existing description as a new paragraph. Idempotent
 * against re-running on the same highlights text; never throws.
 */
export async function enrichPropertyDescriptionFromTour(propertyId: number, extractDir: string): Promise<void> {
    try {
        const highlights = await describeTourVisualHighlights(extractDir)
        if (!highlights) return

        const { storage } = await import('../storage')
        const current = await storage.getProperty(propertyId)
        if (!current?.description || current.description.includes(highlights)) return

        await storage.updateProperty(propertyId, {
            description: `${current.description.trim()}\n\n${highlights}`,
        })
    } catch (err) {
        console.error(`[gene/tour-vision] enrichment failed for property ${propertyId} (non-fatal):`, err)
    }
}
