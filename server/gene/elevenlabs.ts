/**
 * ElevenLabs, shared parts: how many credits are left on the account (so a free plan is never driven past its limit
 * in the middle of a conversation), and Scribe, ElevenLabs' speech-to-text, which understands far more accents and
 * languages (including Kiswahili) than the speech recogniser built into a phone's browser.
 *
 * Everything here is safe to run without a key: `elevenLabsConfigured()` is false and callers fall back to the
 * browser's own recogniser and voice.
 */

const API = 'https://api.elevenlabs.io'

export const elevenLabsConfigured = (): boolean => !!process.env.ELEVENLABS_API_KEY

export interface Credits {
    used: number
    limit: number
    remaining: number
    tier: string
    checkedAt: number
}

let credits: Credits | null = null
let checking: Promise<Credits | null> | null = null

/** The account's credits, refreshed at most once a minute. Null when it cannot be read (the callers then go ahead and let the API decide). */
export async function elevenLabsCredits(force = false): Promise<Credits | null> {
    if (!elevenLabsConfigured()) return null
    if (!force && credits && Date.now() - credits.checkedAt < 60_000) return credits
    if (checking) return checking
    checking = (async () => {
        try {
            const res = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string }, signal: AbortSignal.timeout(8000) })
            if (!res.ok) return credits
            const j: any = await res.json()
            const used = Number(j.character_count)
            const limit = Number(j.character_limit)
            if (!Number.isFinite(used) || !Number.isFinite(limit)) return credits
            credits = { used, limit, remaining: Math.max(0, limit - used), tier: String(j.tier ?? 'unknown'), checkedAt: Date.now() }
            return credits
        } catch {
            return credits
        } finally {
            checking = null
        }
    })()
    return checking
}

/** Spent locally between refreshes, so a burst of requests cannot overshoot the limit before the next check. */
export function noteSpent(units: number): void {
    if (credits) credits = { ...credits, used: credits.used + units, remaining: Math.max(0, credits.remaining - units) }
}

/** True unless the account is known to be out of credits (or has fewer than `needed`). */
export async function hasCredits(needed: number): Promise<boolean> {
    const c = await elevenLabsCredits()
    return !c || c.remaining >= needed
}

// ---------------------------------------------------------------------------
// Speech to text (Scribe)
// ---------------------------------------------------------------------------

/** ISO 639-1 codes Scribe is told to expect. Anything else is left for it to detect. */
const LANGUAGE_HINT = new Set(['en', 'sw', 'fr', 'es', 'pt', 'de', 'ar', 'zh', 'hi', 'am', 'so', 'ha', 'yo', 'ig', 'zu', 'af', 'rw', 'lg', 'ti', 'sn'])

export interface Transcript {
    text: string
    language: string | null
}

/** Seconds of audio in a 16-bit mono WAV of the given size (used to keep a daily budget). */
export function wavSeconds(bytes: number, sampleRate = 16000): number {
    return Math.max(0, (bytes - 44) / (sampleRate * 2))
}

export async function transcribe(audio: Buffer, contentType: string, hint?: string): Promise<Transcript> {
    const attempt = async (language: string | null): Promise<Transcript> => {
        const form = new FormData()
        form.append('model_id', process.env.KEVIN_ELEVENLABS_STT_MODEL || 'scribe_v1')
        form.append('tag_audio_events', 'false')
        form.append('diarize', 'false')
        if (language) form.append('language_code', language)
        form.append('file', new Blob([audio], { type: contentType }), contentType.includes('wav') ? 'speech.wav' : 'speech.webm')
        const res = await fetch(`${API}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string }, body: form, signal: AbortSignal.timeout(25_000) })
        if (!res.ok) throw Object.assign(new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status })
        const j: any = await res.json()
        return { text: String(j.text ?? '').replace(/\s+/g, ' ').trim(), language: typeof j.language_code === 'string' ? j.language_code : null }
    }
    const lang = (hint || '').toLowerCase().split(/[-_]/)[0]
    const code = LANGUAGE_HINT.has(lang) ? lang : null
    try {
        return await attempt(code)
    } catch (err) {
        // A language code the model does not accept: ask again and let it work the language out itself.
        if (code && [400, 422].includes((err as { status?: number }).status ?? 0)) return attempt(null)
        throw err
    }
}
