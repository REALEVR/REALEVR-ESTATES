/**
 * Listening without the browser's speech recogniser.
 *
 * The recogniser built into a phone's browser plays a tone every time it starts or stops, and it understands fewer
 * accents and languages than a dedicated speech model. So Kevin can listen the other way: open the microphone, watch its
 * level, and when someone speaks cut out just that sentence (with a moment from before the first word, so nothing is
 * lost), pack it as a small 16 kHz WAV, and send it to the server to be turned into text (see server/gene/kevin-stt.ts).
 *
 * Nothing is recorded to disk and nothing leaves the device while the room is quiet: audio is held in memory, in a
 * short loop that is overwritten continuously, and only a clip that contains speech is ever sent.
 */

export interface CaptureOptions {
  /** Keep listening for more sentences after the first (hands-free) instead of finishing after one (tap to talk). */
  continuous: boolean
  /** Give up if nobody speaks within this long (tap to talk). 0 = wait forever (hands-free). */
  noSpeechMs?: number
  /** A sentence ends after this much quiet. */
  silenceMs?: number
  /** Never record a single sentence for longer than this. */
  maxMs?: number
  /** Audio kept from before speech was noticed, so the first word is not cut off. */
  preRollMs?: number
  /** Called for each finished sentence (hands-free) or once (tap to talk). */
  onClip: (wav: Blob) => void
  /** Called when speech starts, so the screen can show it is listening. */
  onSpeechStart?: () => void
  /** The microphone could not be opened. */
  onError: (reason: 'blocked' | 'unavailable') => void
  /** Called when a tap-to-talk session ends with nothing said. */
  onNothing?: () => void
}

export interface CaptureSession {
  stop: () => void
}

const TARGET_RATE = 16000

/** Average-down to 16 kHz. Speech models are happy with 16 kHz, and it keeps a clip small. */
function downsample(input: Float32Array, fromRate: number, carry: { pos: number }): Float32Array {
  if (fromRate <= TARGET_RATE) return input
  const ratio = fromRate / TARGET_RATE
  const out: number[] = []
  let pos = carry.pos
  while (pos < input.length) {
    const start = Math.floor(pos)
    const end = Math.min(input.length, Math.floor(pos + ratio))
    let sum = 0
    for (let i = start; i < end; i++) sum += input[i]
    out.push(end > start ? sum / (end - start) : input[start] ?? 0)
    pos += ratio
  }
  carry.pos = pos - input.length
  return Float32Array.from(out)
}

export function encodeWav(chunks: Float32Array[], sampleRate = TARGET_RATE): Blob {
  const length = chunks.reduce((n, c) => n + c.length, 0)
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, length * 2, true)
  let offset = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function canCaptureSpeech(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext || (window as any).webkitAudioContext)
}

export function startCapture(opts: CaptureOptions): CaptureSession {
  const silenceMs = opts.silenceMs ?? 1100
  const maxMs = opts.maxMs ?? 15000
  const preRollMs = opts.preRollMs ?? 700
  let stopped = false
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let processor: ScriptProcessorNode | null = null
  let noSpeechTimer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    stopped = true
    clearTimeout(noSpeechTimer)
    try {
      processor?.disconnect()
    } catch {
      /* already disconnected */
    }
    processor = null
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    void ctx?.close().catch(() => {})
    ctx = null
  }

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (err: any) {
      if (!stopped) opts.onError(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'blocked' : 'unavailable')
      return
    }
    if (stopped) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    try {
      const AudioCtx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext
      ctx = new AudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      processor = ctx.createScriptProcessor(4096, 1, 1)
      const mute = ctx.createGain()
      mute.gain.value = 0 // the processor must be connected to run in some browsers; this keeps it silent
      source.connect(processor)
      processor.connect(mute)
      mute.connect(ctx.destination)

      const inRate = ctx.sampleRate
      const carry = { pos: 0 }
      const frameMs = (4096 / inRate) * 1000
      const preFrames = Math.max(1, Math.round(preRollMs / frameMs))
      const silenceFrames = Math.max(1, Math.round(silenceMs / frameMs))
      const maxFrames = Math.round(maxMs / frameMs)
      let floor = 0.004
      let loud = 0
      let quiet = 0
      let speaking = false
      let voiced = 0
      let ring: Float32Array[] = []
      let clip: Float32Array[] = []

      if (opts.noSpeechMs) {
        noSpeechTimer = setTimeout(() => {
          if (!speaking && !stopped) {
            stop()
            opts.onNothing?.()
          }
        }, opts.noSpeechMs)
      }

      processor.onaudioprocess = (event) => {
        if (stopped) return
        const raw = event.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i]
        const rms = Math.sqrt(sum / raw.length)
        const frame = downsample(new Float32Array(raw), inRate, carry)
        // The room's own hum sets the floor; speech has to stand clearly above it.
        if (!speaking && rms < floor * 2) floor = floor * 0.97 + rms * 0.03
        const isLoud = rms > Math.max(0.02, floor * 4)

        if (!speaking) {
          ring.push(frame)
          if (ring.length > preFrames + 3) ring.shift()
          loud = isLoud ? loud + 1 : Math.max(0, loud - 1)
          if (loud >= 2) {
            speaking = true
            clearTimeout(noSpeechTimer)
            clip = ring.slice()
            ring = []
            quiet = 0
            voiced = loud
            opts.onSpeechStart?.()
          }
          return
        }

        clip.push(frame)
        if (isLoud) {
          voiced++
          quiet = 0
        } else {
          quiet++
        }
        if (quiet >= silenceFrames || clip.length >= maxFrames) {
          const done = clip
          const enough = voiced * frameMs >= 500
          speaking = false
          clip = []
          loud = 0
          quiet = 0
          voiced = 0
          if (enough) opts.onClip(encodeWav(done))
          if (!opts.continuous) {
            stop()
            if (!enough) opts.onNothing?.()
          }
        }
      }
    } catch {
      stop()
      opts.onError('unavailable')
    }
  })()

  return { stop }
}
