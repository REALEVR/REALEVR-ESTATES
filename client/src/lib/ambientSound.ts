/**
 * Soothing welcome ambience — generative instrumental music, synthesized
 * entirely with the Web Audio API rather than a licensed/hosted audio
 * file. Every time it starts (each fresh sign-in, or a manual re-enable
 * via the mute toggle) it picks a brand new "performance": a random key,
 * scale, chord progression, and instrument timbre — so it's never the
 * same piece twice — and it keeps drifting through that progression and
 * improvising a soft melodic line for as long as it plays, rather than
 * looping one fixed phrase. Deliberately quiet and unobtrusive throughout:
 * it's meant to sit under the site, not compete with it.
 *
 * Module-level singleton (same pattern as client/src/lib/iotec-paymentpatch.ts's
 * paymentEmitter) rather than React state, because "just signed in" is
 * handled from several unrelated component trees:
 *   - AuthGate.tsx's Google sign-in and signup paths, and AuthModal.tsx's
 *     Google sign-in, all adopt the user directly (no page reload) —
 *     attemptWelcomeAmbient() can start playback immediately, while the
 *     click that triggered sign-in is still a fresh user gesture browsers
 *     will allow audio to start on.
 *   - use-auth.tsx's traditional-login path does a full
 *     window.location.href reload on success, which both destroys the
 *     in-flight AudioContext and loses that gesture. It can only leave a
 *     breadcrumb (markJustSignedInForReload) for the fresh page load to
 *     pick up — and that fresh load has no user gesture of its own, so
 *     the browser may still block autoplay; see needsGesture below.
 * A shared module lets all of these, plus the floating mute/unmute
 * toggle (AmbientSoundToggle.tsx) mounted once in App.tsx, stay in sync
 * without wiring React context through every one of them.
 *
 * Autoplay honesty: browsers only allow audio to start already-running
 * when there's a recent, genuine user gesture. Google sign-in/signup
 * (above) reliably has one. A post-reload page load from the traditional
 * login flow often doesn't — when starting fails for that reason,
 * `needsGesture` flips true rather than silently failing forever, so the
 * toggle button can visibly invite a tap to start it (which itself is a
 * gesture, so it always works).
 */

const STORAGE_KEY_ENABLED = 'realevr_ambient_sound_enabled' // localStorage — the user's own on/off choice, remembered
export const JUST_SIGNED_IN_FLAG = 'realevr_just_signed_in' // sessionStorage — breadcrumb across the login page reload

type Listener = () => void
const listeners = new Set<Listener>()
function notify() {
    listeners.forEach((l) => l())
}

// ---------------------------------------------------------------------
// Musical material — the pieces a fresh "performance" is assembled from
// on every start. Purely additive knobs: add more scales/shapes/timbres
// here any time to widen the variety further.
// ---------------------------------------------------------------------

/** Soothing modes only — nothing with a harsh/tense interval in it. Each
 * is a set of semitone offsets from the root, one octave's worth. */
const SCALES: number[][] = [
    [0, 2, 4, 7, 9], // major pentatonic — bright, simple, always consonant
    [0, 3, 5, 7, 10], // minor pentatonic — a little more wistful
    [0, 2, 3, 5, 7, 9, 10], // dorian — warm minor with a gentle lift
    [0, 2, 4, 6, 7, 9, 11], // lydian — airy, "hopeful" character
    [0, 2, 4, 7, 11], // major 9th colouring — soft jazz-lounge feel
]

/** A handful of pleasant, not-too-low root notes (Hz) to start the piece
 * on — spread across roughly an octave so back-to-back sign-ins land in
 * a different register, not just a different scale. */
const ROOT_FREQS = [98, 110, 123.47, 130.81, 146.83, 164.81, 174.61] // G2..F3

/** Small chord "shapes" expressed as scale-degree offsets (not semitones —
 * these index into whichever SCALES entry is chosen for this performance,
 * wrapping into higher/lower octaves via degreeToFreq below). Combined
 * randomly into a short progression per performance. */
const CHORD_SHAPES: number[][] = [
    [0, 2, 4],
    [0, 2, 4, 7],
    [2, 4, 6],
    [4, 6, 8],
    [0, 3, 5],
    [-1, 2, 4],
    [1, 4, 6],
]

interface Timbre {
    padWave: OscillatorType
    padCutoff: number
    pluckWave: OscillatorType
    pluckCutoff: number
}

/** Each performance also picks a random instrument colour — different
 * waveform/filter combinations read as genuinely different "instruments"
 * even playing the same notes, which is most of what makes two
 * performances feel unmistakably different from each other. */
const TIMBRES: Timbre[] = [
    { padWave: 'sine', padCutoff: 700, pluckWave: 'triangle', pluckCutoff: 2600 }, // warm pad + soft mallet
    { padWave: 'triangle', padCutoff: 950, pluckWave: 'sine', pluckCutoff: 1900 }, // gentle strings + rounded bell
    { padWave: 'sine', padCutoff: 550, pluckWave: 'square', pluckCutoff: 1300 }, // deep pad + muted music-box (heavily filtered square)
]

function degreeToFreq(rootFreq: number, scale: number[], degree: number): number {
    const len = scale.length
    const octave = Math.floor(degree / len)
    const idx = ((degree % len) + len) % len
    const semitone = scale[idx] + octave * 12
    return rootFreq * Math.pow(2, semitone / 12)
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
}
function randRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

/** Builds a short (3-5 chord) progression with no immediate repeats, so
 * the harmony itself keeps moving for as long as the piece plays. */
function buildProgression(): number[][] {
    const length = 3 + Math.floor(Math.random() * 3) // 3..5 chords
    const progression: number[][] = []
    let last: number[] | null = null
    for (let i = 0; i < length; i++) {
        let shape = pick(CHORD_SHAPES)
        let guard = 0
        while (shape === last && guard++ < 5) shape = pick(CHORD_SHAPES)
        progression.push(shape)
        last = shape
    }
    return progression
}

// ---------------------------------------------------------------------
// Audio engine
// ---------------------------------------------------------------------

interface PadVoice {
    osc: OscillatorNode
    gain: GainNode
}

interface AmbientPerformance {
    rootFreq: number
    scale: number[]
    timbre: Timbre
    progression: number[][]
    chordIndex: number
    padVoices: PadVoice[]
    padFilter: BiquadFilterNode
    pluckFilter: BiquadFilterNode
    masterGain: GainNode
    lfo: OscillatorNode
    chordTimer: ReturnType<typeof setTimeout> | null
    pluckTimer: ReturnType<typeof setTimeout> | null
}

let audioCtx: AudioContext | null = null
let activePerformance: AmbientPerformance | null = null
let playing = false
let needsGesture = false

export function isAmbientEnabled(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_ENABLED)
        return raw === null ? true : raw === '1' // on by default until someone turns it off
    } catch {
        return true
    }
}

function setEnabledPreference(enabled: boolean) {
    try {
        localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? '1' : '0')
    } catch {
        // Private browsing / storage disabled — preference just won't persist
        // across tabs/sessions; the sound itself still works this tab.
    }
}

export function isAmbientPlaying(): boolean {
    return playing
}

export function doesAmbientNeedGesture(): boolean {
    return needsGesture
}

export function subscribeAmbient(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const PAD_BUS_BUDGET = 0.17 // shared across however many notes are in the current chord
const PAD_FADE_SEC = 2.5
const PLUCK_PEAK = 0.16
const MASTER_TARGET = 0.6 // the real "how loud is this" ceiling — everything else is relative to it

/** Fades the current chord's voices out and starts the next chord's voices
 * fading in — a crossfade, not a hard cut, so chord changes read as the
 * music moving, not as a glitch. */
function playChord(ctx: AudioContext, perf: AmbientPerformance, degrees: number[]) {
    const now = ctx.currentTime
    const outgoing = perf.padVoices
    perf.padVoices = []

    // Fade out whatever was sounding before.
    outgoing.forEach(({ osc, gain }) => {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, now + PAD_FADE_SEC)
        osc.stop(now + PAD_FADE_SEC + 0.1)
    })

    // Fade in the new chord.
    const perVoiceTarget = PAD_BUS_BUDGET / degrees.length
    degrees.forEach((degree, i) => {
        const osc = ctx.createOscillator()
        osc.type = perf.timbre.padWave
        osc.frequency.value = degreeToFreq(perf.rootFreq, perf.scale, degree)
        osc.detune.value = (i % 2 === 0 ? -1 : 1) * (3 + i) // slight per-voice detune — avoids a flat, static tone
        const gain = ctx.createGain()
        gain.gain.value = 0
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(perVoiceTarget, now + PAD_FADE_SEC)
        osc.connect(gain)
        gain.connect(perf.padFilter)
        osc.start(now)
        perf.padVoices.push({ osc, gain })
    })
}

/** Advances to the next chord in the progression (looping), then
 * schedules the next advance at a randomised interval — this is the
 * "keeps changing" heartbeat of the harmony itself. */
function scheduleNextChord(ctx: AudioContext, perf: AmbientPerformance) {
    perf.chordTimer = setTimeout(
        () => {
            perf.chordIndex = (perf.chordIndex + 1) % perf.progression.length
            playChord(ctx, perf, perf.progression[perf.chordIndex])
            scheduleNextChord(ctx, perf)
        },
        randRange(18, 32) * 1000
    )
}

/** A single soft, plucked note — short attack, gentle decay — picked from
 * the current chord (with an occasional passing tone a step away for
 * colour) so the melody always harmonises with whatever the pad is doing. */
function pluckNote(ctx: AudioContext, perf: AmbientPerformance) {
    const chord = perf.progression[perf.chordIndex]
    const passingTone = Math.random() < 0.25
    const degree = passingTone
        ? pick(chord) + pick([-1, 1, 2])
        : pick(chord) + 12 * pick([0, 1]) // sometimes an octave up, for register variety
    const freq = degreeToFreq(perf.rootFreq, perf.scale, degree)

    const osc = ctx.createOscillator()
    osc.type = perf.timbre.pluckWave
    osc.frequency.value = freq
    const gain = ctx.createGain()
    const now = ctx.currentTime
    const decay = randRange(1.4, 2.6)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(PLUCK_PEAK, now + 0.012) // fast attack
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay) // gentle decay
    osc.connect(gain)
    gain.connect(perf.pluckFilter)
    osc.start(now)
    osc.stop(now + decay + 0.05)
}

/** Schedules the next pluck (or rest, for natural phrasing) at a
 * humanised, slightly randomised interval — never the same rhythm twice. */
function scheduleNextPluck(ctx: AudioContext, perf: AmbientPerformance) {
    perf.pluckTimer = setTimeout(
        () => {
            if (Math.random() < 0.78) pluckNote(ctx, perf) // occasional rest, so it breathes rather than ticking metronomically
            scheduleNextPluck(ctx, perf)
        },
        randRange(1.6, 4.8) * 1000
    )
}

/** Assembles one fresh "performance" — a new key, scale, progression, and
 * instrument colour, chosen at random — and starts it sounding. This is
 * what makes every sign-in (or manual re-enable) a genuinely different
 * piece rather than the same loop restarting. */
function startPerformance(ctx: AudioContext): AmbientPerformance {
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0
    masterGain.connect(ctx.destination)

    const padFilter = ctx.createBiquadFilter()
    padFilter.type = 'lowpass'
    const pluckFilter = ctx.createBiquadFilter()
    pluckFilter.type = 'lowpass'

    const timbre = pick(TIMBRES)
    padFilter.frequency.value = timbre.padCutoff
    pluckFilter.frequency.value = timbre.pluckCutoff
    padFilter.connect(masterGain)
    pluckFilter.connect(masterGain)

    // Slow LFO breathing the overall level — the "soothing" part; a
    // static level reads as background noise, a very slow swell reads as calm.
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = randRange(0.05, 0.08) // one full breath roughly every 12-20 seconds
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.05
    lfo.connect(lfoGain)
    lfoGain.connect(masterGain.gain)
    lfo.start()

    const perf: AmbientPerformance = {
        rootFreq: pick(ROOT_FREQS),
        scale: pick(SCALES),
        timbre,
        progression: buildProgression(),
        chordIndex: 0,
        padVoices: [],
        padFilter,
        pluckFilter,
        masterGain,
        lfo,
        chordTimer: null,
        pluckTimer: null,
    }

    playChord(ctx, perf, perf.progression[0])
    scheduleNextChord(ctx, perf)
    scheduleNextPluck(ctx, perf)

    return perf
}

function fadeIn(ctx: AudioContext, masterGain: GainNode) {
    const now = ctx.currentTime
    masterGain.gain.cancelScheduledValues(now)
    masterGain.gain.setValueAtTime(masterGain.gain.value, now)
    masterGain.gain.linearRampToValueAtTime(MASTER_TARGET, now + 3)
}

/**
 * Starts (or resumes) the ambience. Safe to call repeatedly — a no-op
 * while already playing. Resolves false (and flips needsGesture) if the
 * browser's autoplay policy blocked it, so callers/UI can react. Each
 * call that actually starts fresh (i.e. wasn't already playing) picks a
 * brand new performance — see startPerformance's doc comment.
 */
export async function startAmbient(): Promise<boolean> {
    if (playing) return true
    try {
        if (!audioCtx) {
            const Ctor = window.AudioContext || (window as any).webkitAudioContext
            if (!Ctor) return false // Web Audio unsupported — fail quietly, nothing to fall back to
            audioCtx = new Ctor()
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume()
        }
        if (audioCtx.state !== 'running') {
            needsGesture = true
            notify()
            return false
        }
        if (!activePerformance) {
            activePerformance = startPerformance(audioCtx)
        }
        fadeIn(audioCtx, activePerformance.masterGain)
        playing = true
        needsGesture = false
        notify()
        return true
    } catch {
        needsGesture = true
        notify()
        return false
    }
}

/** Fades out and fully tears down the current performance — not just a
 * pause, so a signed-out visitor (or someone who mutes it) leaves no
 * oscillators or schedulers silently running in the background. The next
 * startAmbient() call always builds a brand new performance from scratch. */
export function stopAmbient(): void {
    playing = false
    needsGesture = false
    notify()

    if (!audioCtx || !activePerformance) return
    const ctx = audioCtx
    const perf = activePerformance
    const now = ctx.currentTime

    if (perf.chordTimer) clearTimeout(perf.chordTimer)
    if (perf.pluckTimer) clearTimeout(perf.pluckTimer)

    perf.masterGain.gain.cancelScheduledValues(now)
    perf.masterGain.gain.setValueAtTime(perf.masterGain.gain.value, now)
    perf.masterGain.gain.linearRampToValueAtTime(0, now + 1.5)

    audioCtx = null
    activePerformance = null
    setTimeout(() => {
        try {
            perf.padVoices.forEach(({ osc }) => osc.stop())
            perf.lfo.stop()
        } catch {
            // Already stopped — fine.
        }
        ctx.close().catch(() => {})
    }, 1700)
}

/** The floating toggle's click handler — always a genuine user gesture,
 * so turning it back on always works even if an earlier autoplay attempt
 * was blocked. Re-enabling always starts a fresh performance. */
export function toggleAmbient(): void {
    if (isAmbientEnabled()) {
        setEnabledPreference(false)
        stopAmbient()
    } else {
        setEnabledPreference(true)
        void startAmbient()
    }
}

/** Call from a sign-in success handler that has NOT caused a page reload
 * (see this file's doc comment) — attempts to start right away. No-ops if
 * the visitor has previously turned the ambience off. */
export function attemptWelcomeAmbient(): void {
    if (!isAmbientEnabled()) return
    void startAmbient()
}

/** Call right before a sign-in path that reloads the page (use-auth.tsx's
 * traditional login) — leaves a breadcrumb for the fresh load to pick up,
 * since there's no signed-out→signed-in transition to observe there (the
 * very first auth check on that new page already returns the signed-in user). */
export function markJustSignedInForReload(): void {
    try {
        sessionStorage.setItem(JUST_SIGNED_IN_FLAG, '1')
    } catch {
        // Non-fatal — worst case the ambience just doesn't auto-attempt
        // after this particular reload; the toggle still starts it manually.
    }
}

/** Consumed once, on the app's first mount after a fresh page load — see
 * AmbientSoundToggle.tsx. */
export function consumeJustSignedInFlag(): boolean {
    try {
        const had = sessionStorage.getItem(JUST_SIGNED_IN_FLAG) === '1'
        if (had) sessionStorage.removeItem(JUST_SIGNED_IN_FLAG)
        return had
    } catch {
        return false
    }
}
