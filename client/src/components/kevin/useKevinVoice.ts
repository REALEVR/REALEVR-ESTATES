import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Kevin's voice, built on the browser's own speech APIs: nothing to download
 * and no third-party service or key involved.
 *
 * What that costs, honestly: which languages can be spoken depends on the
 * voices installed on the visitor's device. English, French, Spanish and most
 * major languages are nearly always there; Swahili is on many Android phones;
 * Luganda and other smaller languages usually are not. `hasVoice` says
 * whether the current language can be spoken here, and the UI is expected to
 * fall back to text (and say so) when it cannot, rather than fail silently.
 */

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

function voiceScore(v: SpeechSynthesisVoice, wanted: string): number {
  let score = 0
  if (normalise(v.lang) === wanted) score += 4 // exact region beats same language
  if (NATURAL_VOICE.test(v.name)) score += 3
  if (!v.localService) score += 1 // cloud voices are usually the better ones
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

/** A soft two-note earcon, the way a phone assistant signals "I'm listening" / "got it". No audio files. */
let audioContext: AudioContext | null = null
export function chime(kind: 'start' | 'end') {
  try {
    const Ctx: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    audioContext = audioContext ?? new Ctx()
    if (audioContext.state === 'suspended') void audioContext.resume()
    const notes = kind === 'start' ? [880, 1318.5] : [1318.5, 880]
    const t0 = audioContext.currentTime
    notes.forEach((freq, i) => {
      const osc = audioContext!.createOscillator()
      const gain = audioContext!.createGain()
      const at = t0 + i * 0.09
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.07, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2)
      osc.connect(gain).connect(audioContext!.destination)
      osc.start(at)
      osc.stop(at + 0.22)
    })
  } catch {
    /* sound is a nicety; never let it break the conversation */
  }
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
  // Bumped by every speak() and stop(), so the callbacks of an utterance that
  // was cancelled or replaced can tell they are stale and stay quiet.
  const speechRun = useRef(0)

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
    if (synth) synth.cancel()
    setSpeaking(false)
  }, [synth])

  /** Can this device speak the given language (default: the current one)? */
  const hasVoiceFor = useCallback(
    (tag: string | null | undefined = bcp47) => !!synth && !!pickVoice(voicesRef.current, tag ?? null),
    [synth, bcp47],
  )

  /** Returns false (and says nothing) when this device has no voice for the language.
   * `onDone` fires when the whole answer has been spoken, not when it was cut off. */
  const speak = useCallback(
    (text: string, tag: string | null | undefined = bcp47, onDone?: () => void): boolean => {
      const chosen = synth ? pickVoice(voicesRef.current, tag ?? null) : null
      if (!synth || !chosen) return false
      const spoken = cleanForSpeech(text)
      if (!spoken) return false
      try {
        synth.cancel() // never talk over ourselves
        const run = ++speechRun.current
        const pieces = sentences(spoken)
        pieces.forEach((piece, i) => {
          const utterance = new SpeechSynthesisUtterance(piece)
          utterance.voice = chosen
          utterance.lang = chosen.lang
          utterance.rate = 1.03
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
    [synth, bcp47],
  )

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
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
      if (!Recognition) return
      stop() // don't listen to ourselves
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
    [Recognition, bcp47, stop],
  )

  // Leaving the page or unmounting must not leave Kevin talking to nobody.
  useEffect(() => () => {
    synth?.cancel()
    try {
      recognitionRef.current?.abort()
    } catch {
      /* nothing to abort */
    }
  }, [synth])

  return {
    canSpeak: !!synth,
    hasVoice: !!voice,
    hasVoiceFor,
    speaking,
    speak,
    stop,
    canListen: !!Recognition,
    listening,
    listen,
    stopListening,
  }
}
