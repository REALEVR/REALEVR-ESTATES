/**
 * Kevin's own voice.
 *
 * A browser's built-in speech is whatever the visitor's device happens to ship:
 * a different voice on every phone, often flat, and missing for many languages.
 * This gives Kevin ONE recognisable voice everywhere by synthesising it on the
 * server with whichever speech provider is configured, in this order:
 *
 *   1. ElevenLabs  (ELEVENLABS_API_KEY)  - the most flexible. Kevin is a man with an
 *      African accent: by default a male West African library voice. Set
 *      KEVIN_ELEVENLABS_VOICE_ID to any voice in your account, including one you
 *      designed or cloned, and Kevin sounds like that.
 *   2. OpenAI      (OPENAI_API_KEY)      - gpt-4o-mini-tts, which takes a written
 *      direction for the delivery (see KEVIN_DELIVERY below).
 *   3. Gemini      (GEMINI_API_KEY)      - Gemini speech, voice "Charon" by default.
 *
 * With none configured, /api/gene/speak/status says so and the widget quietly
 * keeps using the visitor's device voice, exactly as before. Nothing breaks.
 *
 * This is a public endpoint that spends money per call, so it is deliberately
 * small: short texts only, a per-visitor rate limit, a daily cap, and a cache so
 * a repeated line (the greeting, "Okay.") is paid for once.
 */
import type { Express, Request, Response } from 'express'
import { createHash } from 'crypto'
import { getGeminiClient } from '../lib/gemini'

export type VoiceProvider = 'elevenlabs' | 'openai' | 'gemini'

const MAX_TEXT_CHARS = 400
const MAX_CACHE_ENTRIES = 120
const MAX_CACHE_ENTRY_BYTES = 600 * 1024
const PER_VISITOR_LIMIT = 24 // requests per minute
const DAILY_LIMIT = Number(process.env.KEVIN_TTS_DAILY_LIMIT) || 3000
const REQUEST_TIMEOUT_MS = 20_000

// How Kevin should sound, for providers that accept a written direction.
const KEVIN_DELIVERY =
    'Speak as Kevin, a man: a warm, calm African concierge with a natural East or West African English accent, the way a friendly, ' +
    'well-educated professional from Kampala, Nairobi or Accra speaks. Mid-to-low male voice, unhurried and friendly, like a trusted ' +
    'guide talking to one person. Clear diction, a smile in the voice, never salesy or robotic. Say prices and numbers the way a person would.'

export function configuredProvider(): VoiceProvider | null {
    const wanted = (process.env.KEVIN_VOICE_PROVIDER || '').toLowerCase()
    const available: Record<VoiceProvider, boolean> = {
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
    }
    if ((wanted === 'elevenlabs' || wanted === 'openai' || wanted === 'gemini') && available[wanted]) return wanted
    if (available.elevenlabs) return 'elevenlabs'
    if (available.openai) return 'openai'
    if (available.gemini) return 'gemini'
    return null
}

/** What may be sent to a speech provider: plain sentences, no markup, no addresses, bounded length. */
export function speechText(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw
        .replace(/\[\[[^\]]*\]\]/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[*_`#>~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT_CHARS)
}

/** Gemini returns raw 16-bit mono PCM at 24 kHz; browsers need it wrapped as WAV. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + pcm.length, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20) // PCM
    header.writeUInt16LE(1, 22) // mono
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(sampleRate * 2, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36)
    header.writeUInt32LE(pcm.length, 40)
    return Buffer.concat([header, pcm])
}

interface Audio {
    data: Buffer
    type: string
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<globalThis.Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

// Male African voices from the ElevenLabs library, tried in order when KEVIN_ELEVENLABS_VOICE_ID is not set:
// "Bright" (warm, confident, Ghanaian English), "Moyo" (warm baritone, Nigerian English), then "Daniel" (calm, warm, articulate).
// A library voice can be refused on some plans; the next one is tried, so Kevin always has a male voice.
const ELEVENLABS_DEFAULT_VOICES = ['bDFumwYri07axD9161yA', 'ilWiv7gEzrCtQ2zDJsRl', 'onwK4e9ZLuTAKqWW03F9']
let workingElevenLabsVoice: string | null = null

async function elevenLabsOnce(voiceId: string, text: string): Promise<Audio> {
    const res = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
            text,
            model_id: process.env.KEVIN_ELEVENLABS_MODEL || 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
        }),
    })
    if (!res.ok) throw Object.assign(new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status })
    return { data: Buffer.from(await res.arrayBuffer()), type: 'audio/mpeg' }
}

async function viaElevenLabs(text: string): Promise<Audio> {
    const chosen = (process.env.KEVIN_ELEVENLABS_VOICE_ID || '').trim()
    if (chosen) return elevenLabsOnce(chosen, text)
    const order = workingElevenLabsVoice
        ? [workingElevenLabsVoice, ...ELEVENLABS_DEFAULT_VOICES.filter((v) => v !== workingElevenLabsVoice)]
        : ELEVENLABS_DEFAULT_VOICES
    let lastError: unknown
    for (const voiceId of order) {
        try {
            const audio = await elevenLabsOnce(voiceId, text)
            workingElevenLabsVoice = voiceId
            return audio
        } catch (err) {
            lastError = err
            const status = (err as { status?: number }).status
            // Only a refused voice (not found / needs a paid plan / bad request) moves on to the next; an outage or bad key does not.
            if (status !== 400 && status !== 402 && status !== 404 && status !== 422) throw err
            if (workingElevenLabsVoice === voiceId) workingElevenLabsVoice = null
        }
    }
    throw lastError
}

async function viaOpenAi(text: string): Promise<Audio> {
    const res = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            model: process.env.KEVIN_OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
            voice: process.env.KEVIN_OPENAI_VOICE || 'ash',
            input: text,
            instructions: KEVIN_DELIVERY,
            response_format: 'mp3',
        }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return { data: Buffer.from(await res.arrayBuffer()), type: 'audio/mpeg' }
}

async function viaGemini(text: string): Promise<Audio> {
    const client = getGeminiClient()
    if (!client) throw new Error('Gemini is not configured')
    const response: any = await client.models.generateContent({
        model: process.env.KEVIN_GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: `${KEVIN_DELIVERY}\n\nSay: ${text}` }] }],
        config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.KEVIN_GEMINI_VOICE || 'Charon' } } },
        },
    })
    const data = response?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)?.inlineData?.data
    if (!data) throw new Error('Gemini returned no audio')
    return { data: pcmToWav(Buffer.from(data, 'base64')), type: 'audio/wav' }
}

export async function synthesize(provider: VoiceProvider, text: string): Promise<Audio> {
    if (provider === 'elevenlabs') return viaElevenLabs(text)
    if (provider === 'openai') return viaOpenAi(text)
    return viaGemini(text)
}

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

const cache = new Map<string, Audio>() // insertion order = age; oldest evicted first
const visits = new Map<string, number[]>()
let day = ''
let today = 0

export function allowVisitor(ip: string, now = Date.now()): boolean {
    const recent = (visits.get(ip) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= PER_VISITOR_LIMIT) {
        visits.set(ip, recent)
        return false
    }
    recent.push(now)
    visits.set(ip, recent)
    if (visits.size > 5000) {
        // Keep the table from growing without bound under a flood of addresses.
        for (const [key, times] of Array.from(visits.entries())) if (!times.some((t) => now - t < 60_000)) visits.delete(key)
    }
    return true
}

export function withinDailyBudget(now = new Date()): boolean {
    const stamp = now.toISOString().slice(0, 10)
    if (stamp !== day) {
        day = stamp
        today = 0
    }
    return today < DAILY_LIMIT
}

function remember(key: string, audio: Audio) {
    if (audio.data.length > MAX_CACHE_ENTRY_BYTES) return
    cache.set(key, audio)
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
}

export function registerKevinVoiceRoutes(app: Express): void {
    // Lets the widget decide, once, whether to use Kevin's own voice or the device's.
    app.get('/api/gene/speak/status', (_req: Request, res: Response) => {
        res.set('Cache-Control', 'public, max-age=300').json({ available: configuredProvider() !== null })
    })

    app.post('/api/gene/speak', async (req: Request, res: Response) => {
        const provider = configuredProvider()
        if (!provider) return res.status(501).json({ message: 'No voice provider is configured.' })

        const text = speechText(req.body?.text)
        if (!text) return res.status(400).json({ message: 'Field "text" is required.' })

        const key = createHash('sha1').update(`${provider}|${text}`).digest('hex')
        const hit = cache.get(key)
        if (hit) {
            res.set({ 'Content-Type': hit.type, 'Cache-Control': 'private, max-age=86400', 'X-Kevin-Voice': 'cache' })
            return res.send(hit.data)
        }

        if (!allowVisitor(req.ip || 'unknown')) return res.status(429).json({ message: 'Slow down a little.' })
        if (!withinDailyBudget()) return res.status(429).json({ message: 'Voice is resting for today.' })

        try {
            today++
            const audio = await synthesize(provider, text)
            remember(key, audio)
            res.set({ 'Content-Type': audio.type, 'Cache-Control': 'private, max-age=86400', 'X-Kevin-Voice': provider })
            return res.send(audio.data)
        } catch (err) {
            console.error('[kevin-voice] synthesis failed (the widget will use the device voice):', err)
            return res.status(502).json({ message: 'Voice unavailable right now.' })
        }
    })
}
