import { useEffect, useRef, useState } from 'react'

/**
 * Hands-free: keep the microphone open while the page is on screen, and when
 * someone speaks, wake Kevin so he can answer without a tap.
 *
 * This is the only place the site listens continuously, so it is deliberately
 * narrow and honest:
 *  - It runs only after the visitor turned hands-free on (the caller enforces
 *    that, with a consent card), and `active` is true exactly while the
 *    microphone is open, so the UI can always show it.
 *  - It stops whenever the tab is hidden, and whenever Kevin is busy
 *    (`paused`): listening, thinking or talking. That also stops him hearing
 *    his own voice.
 *  - The browser, not this code, turns speech into text (Chrome and Safari use
 *    their own speech services); nothing is recorded or kept here. Only the
 *    phrase that wakes him is passed on, and only to be answered.
 *  - Short noises and single words ("uh", a cough) do not wake him.
 *
 * Browsers end continuous recognition on their own every so often (silence,
 * time limits), so it is restarted, with a growing pause if it keeps failing.
 */

export type AmbientProblem = 'blocked' | 'unsupported'

interface Options {
  enabled: boolean
  paused: boolean
  bcp47: string | null
  /** First words heard: bring Kevin up on screen at once, before the sentence is finished. */
  onWake: (interim: string) => void
  /** The sentence that woke him, complete. */
  onUtterance: (text: string) => void
  onProblem: (problem: AmbientProblem) => void
}

/** Worth waking for: two words or more, or a real mouthful of characters (languages without spaces). */
export function isMeaningfulSpeech(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const words = trimmed.split(/\s+/).filter(Boolean).length
  return words >= 2 || trimmed.length >= 6
}

function recognitionConstructor(): any {
  return typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
}

export function useAmbientListening({ enabled, paused, bcp47, onWake, onUtterance, onProblem }: Options) {
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  // The callbacks change on every render of the caller; the recogniser must not restart for that.
  const handlers = useRef({ onWake, onUtterance, onProblem })
  handlers.current = { onWake, onUtterance, onProblem }

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const Recognition = recognitionConstructor()
    if (!Recognition) {
      handlers.current.onProblem('unsupported')
      return
    }
    if (paused || !visible) return

    let stopped = false
    let recognition: any = null
    let restart: ReturnType<typeof setTimeout> | undefined
    let failures = 0

    const start = () => {
      if (stopped) return
      let woke = false
      let consumed = false
      recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.lang = bcp47 || navigator.language || 'en-GB'

      recognition.onstart = () => {
        failures = 0
        setActive(true)
      }
      recognition.onresult = (event: any) => {
        if (consumed || stopped) return
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text: string = result?.[0]?.transcript ?? ''
          if (result.isFinal) {
            if (!isMeaningfulSpeech(text)) {
              woke = false
              continue
            }
            consumed = true
            handlers.current.onUtterance(text.trim())
            return
          }
          interim += text
        }
        if (!woke && isMeaningfulSpeech(interim)) {
          woke = true
          handlers.current.onWake(interim.trim())
        }
      }
      recognition.onerror = (event: any) => {
        const error = event?.error
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          stopped = true
          handlers.current.onProblem('blocked')
        } else if (error !== 'no-speech' && error !== 'aborted') {
          failures++
        }
      }
      recognition.onend = () => {
        setActive(false)
        if (stopped) return
        restart = setTimeout(start, Math.min(250 + failures * 900, 6000))
      }
      try {
        recognition.start()
      } catch {
        failures++
        restart = setTimeout(start, Math.min(500 + failures * 900, 6000))
      }
    }
    start()

    return () => {
      stopped = true
      clearTimeout(restart)
      try {
        recognition?.abort()
      } catch {
        /* already stopped */
      }
      setActive(false)
    }
  }, [enabled, paused, visible, bcp47])

  return { active }
}
