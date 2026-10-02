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
import { hasCredits, noteSpent } from './elevenlabs'

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

// Models. Flash v2.5 is the everyday choice: natural, quick, and half the price per character, which is what keeps a free
// plan going. Languages it does not cover (Kiswahili and other African languages) use Eleven v3, the most expressive model,
// which does. KEVIN_ELEVENLABS_MODEL replaces the everyday model; KEVIN_ELEVENLABS_V3_LANGUAGES the list of languages that need v3.
const EVERYDAY_MODEL = () => process.env.KEVIN_ELEVENLABS_MODEL || 'eleven_flash_v2_5'
const V3_LANGUAGES = () => new Set((process.env.KEVIN_ELEVENLABS_V3_LANGUAGES || 'sw,am,ha,yo,ig,zu,so,af,rw,lg,sn,ti').split(',').map((x) => x.trim()))
export function modelFor(lang: string | undefined): string {
    return lang && V3_LANGUAGES().has(lang.toLowerCase()) ? 'eleven_v3' : EVERYDAY_MODEL()
}
/** Credits one character costs: Flash is half price. */
const costPerChar = (model: string) => (model.includes('flash') || model.includes('turbo') ? 0.5 : 1)

async function elevenLabsOnce(voiceId: string, text: string, model: string): Promise<Audio> {
    const res = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
            text,
            model_id: model,
            // A touch less stable than the default, with some style: that is what makes it sound like a person talking
            // rather than a person reading. (Eleven v3 takes its own stability steps and ignores the rest.)
            voice_settings: model === 'eleven_v3' ? { stability: 0.5 } : { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
        }),
    })
    if (!res.ok) throw Object.assign(new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status })
    return { data: Buffer.from(await res.arrayBuffer()), type: 'audio/mpeg' }
}

async function viaElevenLabs(text: string, lang?: string): Promise<Audio> {
    const model = modelFor(lang)
    try {
        const audio = await viaElevenLabsWith(text, model)
        noteSpent(Math.ceil(text.length * costPerChar(model)))
        return audio
    } catch (err) {
        // The expressive model refused (plan, region, language): the everyday one still speaks.
        if (model !== EVERYDAY_MODEL()) {
            const audio = await viaElevenLabsWith(text, EVERYDAY_MODEL())
            noteSpent(Math.ceil(text.length * costPerChar(EVERYDAY_MODEL())))
            return audio
        }
        throw err
    }
}

async function viaElevenLabsWith(text: string, model: string): Promise<Audio> {
    const chosen = (process.env.KEVIN_ELEVENLABS_VOICE_ID || '').trim()
    if (chosen) return elevenLabsOnce(chosen, text, model)
    const order = workingElevenLabsVoice
        ? [workingElevenLabsVoice, ...ELEVENLABS_DEFAULT_VOICES.filter((v) => v !== workingElevenLabsVoice)]
        : ELEVENLABS_DEFAULT_VOICES
    let lastError: unknown
    for (const voiceId of order) {
        try {
            const audio = await elevenLabsOnce(voiceId, text, model)
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

export async function synthesize(provider: VoiceProvider, text: string, lang?: string): Promise<Audio> {
    if (provider === 'elevenlabs') return viaElevenLabs(text, lang)
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

        const lang = typeof req.body?.lang === 'string' && /^[a-z]{2,3}$/i.test(req.body.lang) ? req.body.lang.toLowerCase() : undefined
        const key = createHash('sha1').update(`${provider}|${modelFor(lang)}|${text}`).digest('hex')
        const hit = cache.get(key)
        if (hit) {
            res.set({ 'Content-Type': hit.type, 'Cache-Control': 'private, max-age=86400', 'X-Kevin-Voice': 'cache' })
            return res.send(hit.data)
        }

        if (!allowVisitor(req.ip || 'unknown')) return res.status(429).json({ message: 'Slow down a little.' })
        if (!withinDailyBudget()) return res.status(429).json({ message: 'Voice is resting for today.' })
        // A free ElevenLabs plan has a small monthly allowance: when it is used up the widget quietly uses the device's voice.
        if (provider === 'elevenlabs' && !(await hasCredits(Math.ceil(text.length * costPerChar(modelFor(lang)))))) return res.status(429).json({ message: 'Voice is resting for now.' })

        try {
            today++
            const audio = await synthesize(provider, text, lang)
            remember(key, audio)
            res.set({ 'Content-Type': audio.type, 'Cache-Control': 'private, max-age=86400', 'X-Kevin-Voice': provider })
            return res.send(audio.data)
        } catch (err) {
            console.error('[kevin-voice] synthesis failed (the widget will use the device voice):', err)
            return res.status(502).json({ message: 'Voice unavailable right now.' })
        }
    })
}
