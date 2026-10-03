import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canCaptureSpeech, startCapture, type CaptureSession } from './speechCapture'
import { transcribeClip, useServerStt } from './serverStt'

/**
 * Kevin's voice. Two sources, tried in this order:
 *
 *  1. His own voice, synthesised by the server (server/gene/kevin-voice.ts) when
 *     a speech provider is configured there: the same recognisable voice on every
 *     phone and tablet. Used for the languages that provider speaks well (see
 *     SERVER_VOICE_LANGUAGES); if a request fails mid-answer the rest of it is
 *     spoken with the device voice instead.
 *  2. The browser's own speech APIs: nothing to download and no key involved.
 *
 * What that costs, honestly: which languages can be spoken depends on the
 * voices installed on the visitor's device. English, French, Spanish and most
 * major languages are nearly always there; Swahili is on many Android phones;
 * Luganda and other smaller languages usually are not. `hasVoice` says
 * whether the current language can be spoken here, and the UI is expected to
 * fall back to text (and say so) when it cannot, rather than fail silently.
 */

// Languages Kevin's server voice speaks naturally. Others (Luganda, Kinyarwanda,
// typed-in languages) would be read with the wrong pronunciation, so they use a
// device voice when there is one and otherwise stay text-only, as before.
const SERVER_VOICE_LANGUAGES = new Set(['en', 'sw', 'fr', 'es', 'pt', 'de', 'ar', 'zh', 'hi'])
const primaryLanguage = (tag: string | null | undefined) => (tag ? tag.replace(/_/g, '-').toLowerCase().split('-')[0] : '')

// Asked once per page load, shared by every user of the hook.
let serverVoiceStatus: Promise<boolean> | null = null
function serverVoiceAvailable(): Promise<boolean> {
  if (!serverVoiceStatus) {
    serverVoiceStatus = fetch('/api/gene/speak/status')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j) => j?.available === true)
      .catch(() => false)
  }
  return serverVoiceStatus
}

// When his own voice could not be reached, the whole session uses the device voice for a while: one answer, or two
// answers in a row, must never switch between two different voices. Retried after ten minutes.
let serverVoiceDownUntil = 0
const serverVoiceUsable = () => Date.now() >= serverVoiceDownUntil

// A short silent clip, played inside the first tap so phones allow later playback.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

// Some engines return an empty voice list until they've loaded, then fire
// `voiceschanged`; others never fire it and just have voices immediately.
function loadVoices(synth: SpeechSynthesis, set: (v: SpeechSynthesisVoice[]) => void) {
  const list = synth.getVoices()
  if (list.length) set(list)
}

function normalise(tag: string): string {
  return tag.replace(/_/g, '-').toLowerCase()
}

// Most devices ship several voices per language, and the default is often the
// flattest one. The natural-sounding ones announce themselves in their names
// (Apple's "Enhanced"/"Premium", Google's and Microsoft's "Natural"/"Online"),
// so prefer those; it is the single biggest difference in whether Kevin sounds
// like a person or a screen reader.
const NATURAL_VOICE = /\b(premium|enhanced|natural|neural|online|siri|google)\b|samantha|daniel|karen|moira|serena/i

// Kevin is a man. Devices rarely say a voice's gender, but most name it: these are the
// common male and female names and words across Apple, Google and Microsoft voices,
// including the African-English ones (Kenya, Nigeria, Tanzania, South Africa).
const MALE_VOICE = /\b(male|man)\b|daniel|alex|fred|oliver|arthur|aaron|david|mark|guy|ryan|george|james|thomas|ezra|abeo|chilemba|elimu|rafiki|luke|jorge|diego|paul|henri|claude|stefan/i
const FEMALE_VOICE = /\bfemale\b|woman|samantha|karen|moira|serena|susan|zira|hazel|eva|aria|jenny|libby|sonia|emma|ezinne|imani|zuri|leah|mzuri|google .*\(female\)|victoria|fiona|tessa|amelie|sara|laura|paulina|monica|helena|anna|katja/i
const AFRICAN_REGION = /-(ke|ng|tz|za|gh|ug|zw|rw)$/

function voiceScore(v: SpeechSynthesisVoice, wanted: string): number {
  let score = 0
  const lang = normalise(v.lang)
  if (lang === wanted) score += 4 // exact region beats same language
  if (NATURAL_VOICE.test(v.name)) score += 3
  if (!v.localService) score += 1 // cloud voices are usually the better ones
  const male = MALE_VOICE.test(v.name) && !FEMALE_VOICE.test(v.name)
  if (male) score += 5 // Kevin's a man; this outweighs "natural" so a flat male voice beats a lovely female one
  else if (FEMALE_VOICE.test(v.name)) score -= 5
  if (male && AFRICAN_REGION.test(lang)) score += 5 // an African male voice is better still
  return score
}

export function pickVoice(voices: SpeechSynthesisVoice[], bcp47: string | null): SpeechSynthesisVoice | null {
  if (!bcp47 || voices.length === 0) return null
  const wanted = normalise(bcp47)
  const primary = wanted.split('-')[0]
  const candidates = voices.filter((v) => normalise(v.lang).split('-')[0] === primary)
  if (candidates.length === 0) return null
  return candidates.reduce((best, v) => (voiceScore(v, wanted) > voiceScore(best, wanted) ? v : best))
}

/** How a spoken answer is cut up for the server: the first sentence on its own
 * (so Kevin starts talking quickly), then the rest in at most two further pieces. */
function serverPieces(text: string): string[] {
  const parts = sentences(text)
  if (parts.length <= 1) return parts
  const [first, ...rest] = parts
  const groups: string[] = [first]
  let current = ''
  for (const part of rest) {
    if (current && (current + ' ' + part).length > 280 && groups.length < 2) {
      groups.push(current)
      current = part
    } else {
      current = current ? current + ' ' + part : part
    }
  }
  if (current) groups.push(current)
  return groups
}

/** Split into sentences so a long answer is spoken in pieces. Engines cut off long
 * utterances (Chrome stops after about fifteen seconds), and short pieces also
 * mean "stop" and "interrupt" take effect almost instantly. */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?。！？؟]+[.!?。！？؟]*/g)
  return (parts ?? [text]).map((p) => p.trim()).filter(Boolean)
}

// What reads well on screen reads badly aloud: strip markdown symbols, and
// say "the link" instead of spelling out a URL.
export function cleanForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' the link ')
    .replace(/\bUGX\b/g, 'shillings')
    .replace(/[*_`#>~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function useKevinVoice(bcp47: string | null) {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
  const Recognition: any =
    typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  // speak() is often called right after the language changes, from an async
  // function whose closure predates the re-render, so it reads the latest
  // voices from a ref and takes the language as an argument if it needs to.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  voicesRef.current = voices
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const captureRef = useRef<CaptureSession | null>(null)
  const captureEndRef = useRef<((info: { heard: boolean; error: string | null }) => void) | null>(null)
  const serverStt = useServerStt() && canCaptureSpeech()
  // Bumped by every speak() and stop(), so the callbacks of an utterance that
  // was cancelled or replaced can tell they are stale and stay quiet.
  const speechRun = useRef(0)
  const [serverVoice, setServerVoice] = useState(false)
  // One audio element for the page's lifetime: once a tap has let it play, it may
  // keep playing later clips (phones refuse a brand-new element without a tap).
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelClip = useRef<(() => void) | null>(null)

  useEffect(() => {
    let alive = true
    serverVoiceAvailable().then((ok) => alive && setServerVoice(ok))
    return () => {
      alive = false
    }
  }, [])

  // Unlock audio on the visitor's first touch or click anywhere on the page.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const unlock = () => {
      try {
        const audio = audioRef.current ?? new Audio()
        audioRef.current = audio
        audio.src = SILENT_WAV
        void audio.play().then(() => audio.pause()).catch(() => {})
      } catch {
        /* nothing to unlock on this browser */
      }
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('keydown', unlock, true)
    return () => {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }
  }, [])

  useEffect(() => {
    if (!synth) return
    const refresh = () => loadVoices(synth, setVoices)
    refresh()
    synth.addEventListener?.('voiceschanged', refresh)
    return () => synth.removeEventListener?.('voiceschanged', refresh)
  }, [synth])

  const voice = useMemo(() => pickVoice(voices, bcp47), [voices, bcp47])

  const stop = useCallback(() => {
    speechRun.current += 1
    cancelClip.current?.()
    if (synth) synth.cancel()
    setSpeaking(false)
  }, [synth])

  const usesServerVoice = useCallback(
    (tag: string | null | undefined) => serverVoice && serverVoiceUsable() && SERVER_VOICE_LANGUAGES.has(primaryLanguage(tag)),
    [serverVoice],
  )

  /** Can Kevin speak the given language (default: the current one)? Either with his own voice or the device's. */
  const hasVoiceFor = useCallback(
    (tag: string | null | undefined = bcp47) => usesServerVoice(tag) || (!!synth && !!pickVoice(voicesRef.current, tag ?? null)),
    [synth, bcp47, usesServerVoice],
  )

  /** The device's own voice. `run` is the speech run this belongs to. */
  const speakWithDevice = useCallback(
    (spoken: string, tag: string | null | undefined, onDone: (() => void) | undefined, run: number): boolean => {
      const chosen = synth ? pickVoice(voicesRef.current, tag ?? null) : null
      if (!synth || !chosen) return false
      try {
        const pieces = sentences(spoken)
        pieces.forEach((piece, i) => {
          const utterance = new SpeechSynthesisUtterance(piece)
          utterance.voice = chosen
          utterance.lang = chosen.lang
          // Kevin is a man. A voice that says it is male is only lowered a little; one that does not say is lowered more.
          utterance.pitch = MALE_VOICE.test(chosen.name) && !FEMALE_VOICE.test(chosen.name) ? 0.9 : 0.75
          utterance.rate = 1
          utterance.onstart = () => {
            if (speechRun.current === run) setSpeaking(true)
          }
          utterance.onend = () => {
            if (speechRun.current !== run) return
            if (i === pieces.length - 1) {
              setSpeaking(false)
              onDone?.()
            }
          }
          utterance.onerror = () => {
            if (speechRun.current !== run) return
            setSpeaking(false)
          }
          synth.speak(utterance)
        })
        return true
      } catch (err) {
        // Speech engines vary a lot between devices; if this one refuses,
        // Kevin simply stays in text rather than breaking the conversation.
        console.warn('[kevin] speech failed, continuing in text:', err)
        setSpeaking(false)
        return false
      }
    },
    [synth],
  )

  /** Kevin's own voice: ask the server for each piece (all at once, so the next is
   * ready when the last ends) and play them in turn on the shared audio element. */
  const speakWithServer = useCallback(
    async (spoken: string, tag: string | null | undefined, onDone: (() => void) | undefined, run: number) => {
      const pieces = serverPieces(spoken)
      const clips = pieces.map(
        (piece): Promise<string | null> =>
          fetch('/api/gene/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: piece, lang: primaryLanguage(tag) }),
          })
            .then((r) => (r.ok ? r.blob() : null))
            .then((blob) => (blob ? URL.createObjectURL(blob) : null))
            .catch(() => null),
      )
      const discard = (from: number) => clips.slice(from).forEach((c) => c.then((u) => u && URL.revokeObjectURL(u)))
      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio

      setSpeaking(true)
      for (let i = 0; i < pieces.length; i++) {
        const url = await clips[i]
        if (speechRun.current !== run) return discard(i + (url ? 0 : 1))
        let played = false
        if (url) {
          played = await new Promise<boolean>((resolve) => {
            const finish = (ok: boolean) => {
              audio.onended = null
              audio.onerror = null
              cancelClip.current = null
              URL.revokeObjectURL(url)
              resolve(ok)
            }
            cancelClip.current = () => {
              try {
                audio.pause()
              } catch {
                /* already stopped */
              }
              finish(false)
            }
            audio.onended = () => finish(true)
            audio.onerror = () => finish(false)
            audio.src = url
            audio.play().catch(() => finish(false))
          })
        }
        if (speechRun.current !== run) return discard(i + 1)
        if (!played) {
          // His voice isn't reachable (or the phone blocked it): finish the answer with the device's, and stay
          // with the device voice for the next ten minutes so he does not flip between two voices.
          serverVoiceDownUntil = Date.now() + 10 * 60_000
          discard(i + 1)
          setSpeaking(false)
          const rest = pieces.slice(i).join(' ')
          if (!speakWithDevice(rest, tag, onDone, run)) onDone?.()
          return
        }
      }
      setSpeaking(false)
      onDone?.()
    },
    [speakWithDevice],
  )

  /** Returns false (and says nothing) when Kevin has no way to speak the language here.
   * `onDone` fires when the whole answer has been spoken, not when it was cut off. */
  const speak = useCallback(
    (text: string, tag: string | null | undefined = bcp47, onDone?: () => void): boolean => {
      const spoken = cleanForSpeech(text)
      if (!spoken) return false
      const server = usesServerVoice(tag)
      if (!server && !(synth && pickVoice(voicesRef.current, tag ?? null))) return false
      synth?.cancel() // never talk over ourselves
      cancelClip.current?.()
      const run = ++speechRun.current
      if (server) {
        void speakWithServer(spoken, tag, onDone, run)
        return true
      }
      return speakWithDevice(spoken, tag, onDone, run)
    },
    [synth, bcp47, usesServerVoice, speakWithServer, speakWithDevice],
  )

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
    if (captureRef.current) {
      captureRef.current.stop()
      captureEndRef.current?.({ heard: false, error: 'aborted' })
    }
    setListening(false)
  }, [])

  /**
   * One utterance in. `onInterim` streams the words as they are recognised (so
   * the screen can show what Kevin is hearing, live), `onFinal` delivers the
   * finished sentence, and `onEnd` always fires last with whether anything was
   * heard and the engine's error, if any ("not-allowed" = microphone blocked,
   * "no-speech" = silence). Needs the mic permission the first time.
   */
  const listen = useCallback(
    (handlers: {
      onInterim?: (text: string) => void
      onFinal: (text: string) => void
      onEnd?: (info: { heard: boolean; error: string | null }) => void
    }) => {
      if (!Recognition && !serverStt) return
      stop() // don't listen to ourselves
      if (serverStt) {
        // The better ear: cut out one sentence, send it to be transcribed. No tone from the phone, no interim words.
        captureRef.current?.stop()
        let finished = false
        const end = (info: { heard: boolean; error: string | null }) => {
          if (finished) return
          finished = true
          captureRef.current = null
          captureEndRef.current = null
          setListening(false)
          handlers.onEnd?.(info)
        }
        captureEndRef.current = end
        setListening(true)
        captureRef.current = startCapture({
          continuous: false,
          noSpeechMs: 7000,
          maxMs: 15000,
          silenceMs: 1100,
          onSpeechStart: () => handlers.onInterim?.('…'),
          onClip: (wav) => {
            void transcribeClip(wav, bcp47).then((text) => {
              if (text) {
                handlers.onFinal(text)
                end({ heard: true, error: null })
              } else end({ heard: false, error: text === null ? 'network' : 'no-speech' })
            })
          },
          onNothing: () => end({ heard: false, error: 'no-speech' }),
          onError: (reason) => end({ heard: false, error: reason === 'blocked' ? 'not-allowed' : 'audio-capture' }),
        })
        return
      }
      const recognition = new Recognition()
      let heard = false
      let error: string | null = null
      recognition.lang = bcp47 || navigator.language || 'en-GB'
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text: string = result?.[0]?.transcript ?? ''
          if (result.isFinal) {
            if (text.trim() && !heard) {
              heard = true
              handlers.onFinal(text.trim())
            }
          } else {
            interim += text
          }
        }
        if (interim && !heard) handlers.onInterim?.(interim.trim())
      }
      recognition.onend = () => {
        setListening(false)
        handlers.onEnd?.({ heard, error })
      }
      recognition.onerror = (event: any) => {
        error = event?.error ?? 'error'
      }
      recognitionRef.current = recognition
      try {
        recognition.start()
        setListening(true)
      } catch {
        setListening(false)
        handlers.onEnd?.({ heard: false, error: 'start-failed' })
      }
    },
    [Recognition, bcp47, stop, serverStt],
  )

  // Leaving the page or unmounting must not leave Kevin talking to nobody.
  useEffect(() => () => {
    captureRef.current?.stop()
    synth?.cancel()
    cancelClip.current?.()
    try {
      recognitionRef.current?.abort()
    } catch {
      /* nothing to abort */
    }
  }, [synth])

  return {
    canSpeak: !!synth || serverVoice,
    hasVoice: !!voice || serverVoice,
    hasVoiceFor,
    speaking,
    speak,
    stop,
    canListen: !!Recognition || serverStt,
    listening,
    listen,
    stopListening,
  }
}
