/**
 * Soothing welcome ambience — a soft, slowly "breathing" pad chord that
 * fades in after someone signs in, synthesized entirely with the Web
 * Audio API rather than a licensed/hosted audio file. Deliberately quiet
 * and unobtrusive: it's meant to sit under the site, not compete with it.
 *
 * Module-level singleton (same pattern as client/src/lib/iotec-paymentpatch.ts's
 * paymentEmitter) rather than React state, because "just signed in" is
 * handled from several unrelated component trees:
 *   - AuthGate.tsx's Google sign-in and signup paths both adopt the user
 *     directly (no page reload) — attemptWelcomeAmbient() can start
 *     playback immediately, while the click that triggered sign-in is
 *     still a fresh user gesture browsers will allow audio to start on.
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

interface AmbientNodes {
    oscillators: OscillatorNode[]
    lfo: OscillatorNode
    masterGain: GainNode
}

let audioCtx: AudioContext | null = null
let nodes: AmbientNodes | null = null
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

function buildGraph(ctx: AudioContext): AmbientNodes {
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0
    masterGain.connect(ctx.destination)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    filter.connect(masterGain)

    // A soft, warm chord — root, fifth, octave, and a major third a
    // further octave up for a little shimmer — quiet triangle waves, each
    // slightly detuned so it doesn't read as one flat, static tone.
    const freqs = [110, 164.81, 220, 277.18] // A2, E3, A3, C#4
    const oscillators = freqs.map((freq, i) => {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = freq
        osc.detune.value = (i % 2 === 0 ? -1 : 1) * (3 + i)
        const voiceGain = ctx.createGain()
        voiceGain.gain.value = i === 0 ? 1 : 0.55 / i // root voice loudest, the rest quieter
        osc.connect(voiceGain)
        voiceGain.connect(filter)
        osc.start()
        return osc
    })

    // Slow LFO breathing the overall level — the "soothing" part; a
    // static pad reads as background noise, a very slow swell reads as calm.
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.06 // one full breath roughly every 16 seconds
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.012
    lfo.connect(lfoGain)
    lfoGain.connect(masterGain.gain)
    lfo.start()

    return { oscillators, lfo, masterGain }
}

const TARGET_LEVEL = 0.05 // deliberately low — background, not foreground

function fadeIn(ctx: AudioContext, masterGain: GainNode) {
    const now = ctx.currentTime
    masterGain.gain.cancelScheduledValues(now)
    masterGain.gain.setValueAtTime(masterGain.gain.value, now)
    masterGain.gain.linearRampToValueAtTime(TARGET_LEVEL, now + 3)
}

/**
 * Starts (or resumes) the ambience. Safe to call repeatedly — a no-op
 * while already playing. Resolves false (and flips needsGesture) if the
 * browser's autoplay policy blocked it, so callers/UI can react.
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
        if (!nodes) {
            nodes = buildGraph(audioCtx)
        }
        fadeIn(audioCtx, nodes.masterGain)
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

/** Fades out and tears down the audio graph — not just a pause, so a
 * signed-out visitor (or someone who mutes it) leaves no oscillators
 * silently running in the background. */
export function stopAmbient(): void {
    playing = false
    needsGesture = false
    notify()

    if (!audioCtx || !nodes) return
    const ctx = audioCtx
    const activeNodes = nodes
    const now = ctx.currentTime
    activeNodes.masterGain.gain.cancelScheduledValues(now)
    activeNodes.masterGain.gain.setValueAtTime(activeNodes.masterGain.gain.value, now)
    activeNodes.masterGain.gain.linearRampToValueAtTime(0, now + 1.5)

    audioCtx = null
    nodes = null
    setTimeout(() => {
        try {
            activeNodes.oscillators.forEach((o) => o.stop())
            activeNodes.lfo.stop()
        } catch {
            // Already stopped — fine.
        }
        ctx.close().catch(() => {})
    }, 1700)
}

/** The floating toggle's click handler — always a genuine user gesture,
 * so turning it back on always works even if an earlier autoplay attempt
 * was blocked. */
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
