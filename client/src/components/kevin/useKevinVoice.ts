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

export function pickVoice(voices: SpeechSynthesisVoice[], bcp47: string | null): SpeechSynthesisVoice | null {
  if (!bcp47 || voices.length === 0) return null
  const wanted = normalise(bcp47)
  const primary = wanted.split('-')[0]
  return (
    voices.find((v) => normalise(v.lang) === wanted) ||
    voices.find((v) => normalise(v.lang).split('-')[0] === primary) ||
    null
  )
}

// What reads well on screen reads badly aloud: strip markdown symbols, and
// say "the link" instead of spelling out a URL.
export function cleanForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' the link ')
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

  useEffect(() => {
    if (!synth) return
    const refresh = () => loadVoices(synth, setVoices)
    refresh()
    synth.addEventListener?.('voiceschanged', refresh)
    return () => synth.removeEventListener?.('voiceschanged', refresh)
  }, [synth])

  const voice = useMemo(() => pickVoice(voices, bcp47), [voices, bcp47])

  const stop = useCallback(() => {
    if (synth) synth.cancel()
    setSpeaking(false)
  }, [synth])

  /** Can this device speak the given language (default: the current one)? */
  const hasVoiceFor = useCallback(
    (tag: string | null | undefined = bcp47) => !!synth && !!pickVoice(voicesRef.current, tag ?? null),
    [synth, bcp47],
  )

  /** Returns false (and says nothing) when this device has no voice for the language. */
  const speak = useCallback(
    (text: string, tag: string | null | undefined = bcp47): boolean => {
      const chosen = synth ? pickVoice(voicesRef.current, tag ?? null) : null
      if (!synth || !chosen) return false
      const spoken = cleanForSpeech(text)
      if (!spoken) return false
      try {
        synth.cancel() // never talk over ourselves
        const utterance = new SpeechSynthesisUtterance(spoken)
        utterance.voice = chosen
        utterance.lang = chosen.lang
        utterance.rate = 0.98
        utterance.onstart = () => setSpeaking(true)
        utterance.onend = () => setSpeaking(false)
        utterance.onerror = () => setSpeaking(false)
        synth.speak(utterance)
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

  /** One utterance in, transcript out. Recognition needs the mic permission the first time. */
  const listen = useCallback(
    (onTranscript: (text: string) => void) => {
      if (!Recognition) return
      stop() // don't listen to ourselves
      const recognition = new Recognition()
      recognition.lang = bcp47 || navigator.language || 'en-GB'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript
        if (transcript) onTranscript(transcript)
      }
      recognition.onend = () => setListening(false)
      recognition.onerror = () => setListening(false)
      recognitionRef.current = recognition
      try {
        recognition.start()
        setListening(true)
      } catch {
        setListening(false)
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
