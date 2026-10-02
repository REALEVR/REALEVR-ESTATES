/**
 * Kevin's ears: POST /api/gene/transcribe takes a short clip of speech (16 kHz mono WAV, or WebM) and returns the words,
 * using whichever free speech service has an allowance left (ElevenLabs Scribe, Groq Whisper or Azure AI Speech, see
 * speech-providers.ts). They are better recognisers than the browser's (more accents, Kiswahili, noisy rooms) and they
 * make no sound on a phone, unlike the browser's built-in recogniser which beeps every time it opens.
 *
 * It is a public endpoint that spends credits, so it is deliberately small: clips of at most 20 seconds, a per-visitor
 * rate limit, a daily budget of audio seconds, and each speech service's own free allowance (see speech-providers.ts). When
 * none can take a clip (or no key is set), /api/gene/transcribe/status says so and the widget keeps using the browser's
 * recogniser, exactly as before. The clip goes to the speech service to be turned into text and is not kept by us.
 */
import express, { type Express, type Request, type Response } from 'express'
import { wavSeconds } from './elevenlabs'
import { hear, sttUsable } from './speech-providers'

const MAX_BYTES = 1_000_000 // ~30 s of 16 kHz mono WAV
const MAX_SECONDS = 20
const PER_VISITOR_PER_MIN = 12
const DAILY_SECONDS = Number(process.env.KEVIN_STT_DAILY_SECONDS) || 7200

const visits = new Map<string, number[]>()
let day = ''
let secondsToday = 0

export function allowTranscription(ip: string, now = Date.now()): boolean {
    const recent = (visits.get(ip) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= PER_VISITOR_PER_MIN) {
        visits.set(ip, recent)
        return false
    }
    recent.push(now)
    visits.set(ip, recent)
    if (visits.size > 5000) for (const [k, v] of Array.from(visits.entries())) if (!v.some((t) => now - t < 60_000)) visits.delete(k)
    return true
}

function budgetLeft(now = new Date()): number {
    const stamp = now.toISOString().slice(0, 10)
    if (stamp !== day) {
        day = stamp
        secondsToday = 0
    }
    return Math.max(0, DAILY_SECONDS - secondsToday)
}

/** Garbage a recogniser makes of silence and noise. Not worth waking anyone for. */
export function usableTranscript(text: string): boolean {
    const t = text.trim()
    if (t.length < 2) return false
    if (/^[\s.,!?…\-–—'"()\[\]*]+$/.test(t)) return false
    if (/^\(?(music|noise|silence|applause|laughter|inaudible|background)[^)]*\)?$/i.test(t)) return false
    return true
}

export function registerKevinSttRoutes(app: Express): void {
    app.get('/api/gene/transcribe/status', (_req: Request, res: Response) => {
        res.set('Cache-Control', 'public, max-age=30').json({ available: budgetLeft() >= 5 && sttUsable(5).length > 0 })
    })

    app.post(
        '/api/gene/transcribe',
        express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_BYTES }),
        async (req: Request, res: Response) => {
            const body = req.body as Buffer | undefined
            if (!Buffer.isBuffer(body) || body.length < 2000) return res.status(400).json({ message: 'Send a short audio clip.' })
            const type = String(req.headers['content-type'] || 'audio/wav').split(';')[0]
            const isWav = body.subarray(0, 4).toString('ascii') === 'RIFF'
            const seconds = isWav ? wavSeconds(body.length) : Math.min(MAX_SECONDS, body.length / 4000)
            if (seconds > MAX_SECONDS + 1) return res.status(413).json({ message: 'That clip is too long.' })
            if (!allowTranscription(req.ip || 'unknown')) return res.status(429).json({ message: 'Slow down a little.' })
            if (budgetLeft() < seconds) return res.status(429).json({ message: 'Listening is resting for today.' })
            if (sttUsable(seconds).length === 0) return res.status(501).json({ message: 'Speech recognition is not available right now.' })
            try {
                const hint = typeof req.query.lang === 'string' ? req.query.lang.slice(0, 12) : undefined
                const result = await hear(body, isWav ? 'audio/wav' : type, hint, seconds)
                if (!result) return res.status(502).json({ message: 'Could not hear that right now.' })
                secondsToday += seconds
                res.set('Cache-Control', 'no-store').json({ text: usableTranscript(result.text) ? result.text : '', language: result.language, via: result.provider })
            } catch (err) {
                console.error('[kevin-stt] transcription failed (the widget will use the browser recogniser):', err)
                res.status(502).json({ message: 'Could not hear that right now.' })
            }
        },
    )
}
