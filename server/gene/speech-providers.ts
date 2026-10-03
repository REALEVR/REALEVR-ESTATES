/**
 * Every free way Kevin can hear and speak, and the order he tries them in.
 *
 *  HEARING (speech to text), tried in this order unless KEVIN_STT_PROVIDERS says otherwise:
 *    1. ElevenLabs Scribe  (ELEVENLABS_API_KEY)               free credits each month
 *    2. Groq Whisper       (GROQ_API_KEY)                     free tier, very fast, good with Kiswahili
 *    3. Azure AI Speech    (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION)  free F0 tier: about 5 hours a month,
 *                          with Kenyan, Tanzanian, Nigerian, South African and Ghanaian English and Kiswahili
 *
 *  SPEAKING (text to speech), see kevin-voice.ts, the order there is ElevenLabs, Azure, Gemini, OpenAI:
 *    Azure AI Speech neural voices (free F0 tier: about 500,000 characters a month), by default a male Kenyan
 *    English voice and male Kiswahili voices.
 *
 * A provider that is not configured is simply skipped. One that is out of credits, rate-limited or down is rested for a
 * while and the next one is used, so Kevin keeps working while ANY free allowance is left. With none left, the widget
 * uses the browser's own recogniser and voice, as it always did.
 */
import { elevenLabsConfigured, hasCredits, noteSpent, transcribe as elevenLabsTranscribe } from './elevenlabs'
import { nextId, nowIso, readCollection, writeCollection } from './store'

export type SttProvider = 'elevenlabs' | 'groq' | 'azure'
export type TtsProvider = 'elevenlabs' | 'azure' | 'gemini' | 'openai'

const AZURE_REGION = () => (process.env.AZURE_SPEECH_REGION || '').trim()
export const azureConfigured = (): boolean => !!process.env.AZURE_SPEECH_KEY && !!AZURE_REGION()
export const groqConfigured = (): boolean => !!process.env.GROQ_API_KEY

// ---------------------------------------------------------------------------
// Usage the free tiers are measured in (kept across restarts)
// ---------------------------------------------------------------------------

interface UsageRow {
    id: number
    key: string
    value: number
    updatedAt: string
}
const C_USAGE = 'gene_speech_usage'
const month = (d = new Date()) => d.toISOString().slice(0, 7)

export function getUsage(key: string): number {
    return readCollection<UsageRow>(C_USAGE).find((r) => r.key === key)?.value ?? 0
}
export function addUsage(key: string, amount: number): void {
    const rows = readCollection<UsageRow>(C_USAGE)
    const row = rows.find((r) => r.key === key)
    if (row) {
        row.value += amount
        row.updatedAt = nowIso()
    } else rows.push({ id: nextId(rows), key, value: amount, updatedAt: nowIso() })
    // Old months are dropped so the file stays tiny.
    writeCollection(
        C_USAGE,
        rows.filter((r) => r.key.endsWith(month()) || Date.now() - Date.parse(r.updatedAt) < 40 * 86_400_000),
    )
}

const AZURE_TTS_MONTHLY = () => Number(process.env.KEVIN_AZURE_TTS_MONTHLY_CHARS) || 450_000
const AZURE_STT_MONTHLY = () => Number(process.env.KEVIN_AZURE_STT_MONTHLY_SECONDS) || 16_000

export const azureTtsKey = () => `azure-tts:${month()}`
export const azureSttKey = () => `azure-stt:${month()}`
export const azureTtsHasRoom = (chars: number): boolean => getUsage(azureTtsKey()) + chars <= AZURE_TTS_MONTHLY()
export const azureSttHasRoom = (seconds: number): boolean => getUsage(azureSttKey()) + seconds <= AZURE_STT_MONTHLY()

// ---------------------------------------------------------------------------
// Resting a provider that said no
// ---------------------------------------------------------------------------

const restingUntil = new Map<string, number>()
export const isResting = (name: string): boolean => (restingUntil.get(name) ?? 0) > Date.now()
export function rest(name: string, ms: number): void {
    restingUntil.set(name, Date.now() + ms)
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

const primary = (tag: string | undefined | null) => (tag ? tag.replace(/_/g, '-').toLowerCase().split('-')[0] : '')

/** Azure recognises a locale, not just a language. Use the visitor's own (en-KE, sw-TZ ...) when it is one Azure has. */
const AZURE_LOCALES: Record<string, string> = { sw: 'sw-KE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', de: 'de-DE', ar: 'ar-EG', zh: 'zh-CN', hi: 'hi-IN', so: 'so-SO', am: 'am-ET', zu: 'zu-ZA', af: 'af-ZA' }
const AZURE_EXACT = new Set(['en-ke', 'en-ng', 'en-tz', 'en-za', 'en-gh', 'en-gb', 'en-us', 'en-au', 'en-ca', 'en-in', 'en-ie', 'sw-ke', 'sw-tz', 'fr-fr', 'fr-ca', 'es-es', 'es-mx', 'pt-br', 'pt-pt', 'de-de', 'ar-eg', 'ar-sa', 'ar-ae', 'zh-cn', 'hi-in'])
export function azureLocale(tag: string | undefined | null): string | null {
    if (!tag) return null
    const t = tag.replace(/_/g, '-')
    if (AZURE_EXACT.has(t.toLowerCase())) {
        const [l, r] = t.split('-')
        return `${l.toLowerCase()}-${r.toUpperCase()}`
    }
    return AZURE_LOCALES[primary(t)] ?? null
}

/** Neural male voices, chosen for an African concierge. KEVIN_AZURE_VOICE replaces them all; KEVIN_AZURE_ENGLISH_VOICE just the English one. */
export function azureVoiceFor(lang: string | undefined): string {
    if (process.env.KEVIN_AZURE_VOICE) return process.env.KEVIN_AZURE_VOICE
    const voices: Record<string, string> = {
        sw: 'sw-KE-RafikiNeural',
        fr: 'fr-FR-HenriNeural',
        es: 'es-ES-AlvaroNeural',
        pt: 'pt-BR-AntonioNeural',
        de: 'de-DE-ConradNeural',
        ar: 'ar-EG-ShakirNeural',
        zh: 'zh-CN-YunxiNeural',
        hi: 'hi-IN-MadhurNeural',
        so: 'so-SO-MuuseNeural',
        am: 'am-ET-AmehaNeural',
        zu: 'zu-ZA-ThembaNeural',
        af: 'af-ZA-WillemNeural',
    }
    return voices[primary(lang)] ?? process.env.KEVIN_AZURE_ENGLISH_VOICE ?? 'en-KE-ChilembaNeural'
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

// ---------------------------------------------------------------------------
// Azure: speaking
// ---------------------------------------------------------------------------

export async function azureSpeak(text: string, lang?: string): Promise<{ data: Buffer; type: string }> {
    const voice = azureVoiceFor(lang)
    const locale = voice.split('-').slice(0, 2).join('-')
    // A little slower than the default and a touch of warmth in pitch: what makes a neural voice sound like a person talking to you.
    const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'><prosody rate='-4%'>${xmlEscape(text)}</prosody></voice></speak>`
    const res = await fetch(`https://${AZURE_REGION()}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY as string,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
            'User-Agent': 'realevr-kevin',
        },
        body: ssml,
        signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw Object.assign(new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 160)}`), { status: res.status })
    addUsage(azureTtsKey(), text.length)
    return { data: Buffer.from(await res.arrayBuffer()), type: 'audio/mpeg' }
}

// ---------------------------------------------------------------------------
// Hearing
// ---------------------------------------------------------------------------

export interface HeardResult {
    text: string
    language: string | null
    provider: SttProvider
}

export function sttOrder(): SttProvider[] {
    const wanted = (process.env.KEVIN_STT_PROVIDERS || 'elevenlabs,groq,azure')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is SttProvider => s === 'elevenlabs' || s === 'groq' || s === 'azure')
    return wanted.length ? wanted : ['elevenlabs', 'groq', 'azure']
}

function sttConfigured(p: SttProvider): boolean {
    return p === 'elevenlabs' ? elevenLabsConfigured() : p === 'groq' ? groqConfigured() : azureConfigured()
}

/** The providers that could take a clip right now. */
export function sttUsable(seconds: number): SttProvider[] {
    return sttOrder().filter((p) => sttConfigured(p) && !isResting(`stt:${p}`) && (p !== 'azure' || azureSttHasRoom(seconds)))
}

/** Speech Whisper-style models make up out of silence and noise. */
const PHANTOM = /^(you|thank you|thanks|thanks for watching|thank you for watching|please subscribe|subscribe|bye|bye bye|okay|ok|hmm|um|uh|\.+)$/i

async function groqTranscribe(audio: Buffer, contentType: string, hint?: string): Promise<{ text: string; language: string | null }> {
    const form = new FormData()
    form.append('model', process.env.KEVIN_GROQ_STT_MODEL || 'whisper-large-v3-turbo')
    form.append('response_format', 'verbose_json')
    form.append('temperature', '0')
    const lang = primary(hint)
    if (lang && /^[a-z]{2}$/.test(lang)) form.append('language', lang)
    form.append('file', new Blob([audio], { type: contentType }), contentType.includes('wav') ? 'speech.wav' : 'speech.webm')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) throw Object.assign(new Error(`Groq STT ${res.status}: ${(await res.text()).slice(0, 160)}`), { status: res.status, retryAfter: Number(res.headers.get('retry-after')) || 0 })
    const j: any = await res.json()
    const segments: any[] = Array.isArray(j.segments) ? j.segments : []
    const silent = segments.length > 0 && segments.every((s) => Number(s.no_speech_prob) > 0.7)
    const text = silent ? '' : String(j.text ?? '').replace(/\s+/g, ' ').trim()
    return { text: PHANTOM.test(text.replace(/[.!?,]+$/g, '').trim()) ? '' : text, language: typeof j.language === 'string' ? j.language : null }
}

async function azureTranscribe(audio: Buffer, hint?: string): Promise<{ text: string; language: string | null }> {
    const locale = azureLocale(hint) ?? 'en-GB'
    const res = await fetch(`https://${AZURE_REGION()}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=simple`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY as string, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json' },
        body: audio,
        signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) throw Object.assign(new Error(`Azure STT ${res.status}: ${(await res.text()).slice(0, 160)}`), { status: res.status })
    const j: any = await res.json()
    return { text: j.RecognitionStatus === 'Success' ? String(j.DisplayText ?? '').trim() : '', language: locale }
}

/**
 * Try each usable provider in turn. A provider that is rate-limited, out of credits or erroring rests for a while
 * (a minute for a hiccup, longer for "you have used your allowance") and the next one is asked.
 * Returns null when none could be used.
 */
export async function hear(audio: Buffer, contentType: string, hint: string | undefined, seconds: number): Promise<HeardResult | null> {
    const isWav = contentType.includes('wav')
    for (const p of sttUsable(seconds)) {
        try {
            if (p === 'elevenlabs') {
                if (!(await hasCredits(Math.ceil(seconds * (Number(process.env.KEVIN_STT_CREDITS_PER_SECOND) || 20))))) {
                    rest('stt:elevenlabs', 10 * 60_000)
                    continue
                }
                noteSpent(Math.ceil(seconds * (Number(process.env.KEVIN_STT_CREDITS_PER_SECOND) || 20)))
                const r = await elevenLabsTranscribe(audio, contentType, hint)
                return { ...r, provider: p }
            }
            if (p === 'groq') {
                const r = await groqTranscribe(audio, contentType, hint)
                return { ...r, provider: p }
            }
            if (!isWav) continue // Azure's short-audio endpoint is used here with 16 kHz WAV only
            const r = await azureTranscribe(audio, hint)
            addUsage(azureSttKey(), seconds)
            return { ...r, provider: p }
        } catch (err) {
            const status = (err as { status?: number }).status ?? 0
            const retry = (err as { retryAfter?: number }).retryAfter
            console.error(`[speech] ${p} could not transcribe (status ${status || 'network'}); trying the next one`)
            rest(`stt:${p}`, status === 429 || status === 402 ? Math.max(5 * 60_000, (retry || 0) * 1000) : status === 401 || status === 403 ? 30 * 60_000 : 60_000)
        }
    }
    return null
}

/** For the admin screen: what is set up and what has been used this month. */
export function speechStatus() {
    return {
        hearing: sttOrder().map((p) => ({ provider: p, configured: sttConfigured(p), resting: isResting(`stt:${p}`) })),
        speaking: {
            azure: { configured: azureConfigured(), charsThisMonth: getUsage(azureTtsKey()), charsAllowed: AZURE_TTS_MONTHLY() },
        },
        azureHearing: { configured: azureConfigured(), secondsThisMonth: Math.round(getUsage(azureSttKey())), secondsAllowed: AZURE_STT_MONTHLY() },
    }
}
