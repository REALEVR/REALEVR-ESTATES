import { useEffect, useRef, useState } from 'react'
import { isAboutProperties } from './propertyTalk'

/**
 * Hands-free: keep the microphone open while the page is on screen, and when
 * someone speaks to Kevin about property, wake him so he can answer without a tap.
 *
 * This is the only place the site listens continuously, so it is deliberately
 * narrow and honest:
 *  - The caller starts it only when the browser has already been given
 *    permission (it never causes a permission prompt by itself), and leaves a
 *    visible toggle to turn it off for good. `active` is true exactly while the
 *    microphone is open, so the UI can always show it.
 *  - It reacts only to speech about property (renting, buying, selling, homes,
 *    land, stays, anywhere in the world) or said to him by name. Everything else
 *    heard is let go, so a conversation in the room or a television never opens him.
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
  /** Only speech that passes this wakes him (default: about property, anywhere in the world, or said to Kevin by name). */
  relevant?: (text: string) => boolean
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

export function useAmbientListening({ enabled, paused, bcp47, onWake, onUtterance, onProblem, relevant = isAboutProperties }: Options) {
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  // The callbacks change on every render of the caller; the recogniser must not restart for that.
  const handlers = useRef({ onWake, onUtterance, onProblem, relevant })
  handlers.current = { onWake, onUtterance, onProblem, relevant }

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
    let quiet = 0 // consecutive rounds that ended with nothing said: each one waits longer before reopening

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
        quiet = 0
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text: string = result?.[0]?.transcript ?? ''
          if (result.isFinal) {
            // Said, but not about property and not to him: let it pass, as a person in the room would.
            if (!isMeaningfulSpeech(text) || !handlers.current.relevant(text)) {
              woke = false
              continue
            }
            consumed = true
            handlers.current.onUtterance(text.trim())
            return
          }
          interim += text
        }
        if (!woke && isMeaningfulSpeech(interim) && handlers.current.relevant(interim)) {
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
        // Every reopening can make a phone chirp or flash its microphone indicator, so a quiet room is
        // revisited ever more slowly (a quarter second at first, up to 12 seconds), and speech resets that.
        quiet = Math.min(quiet + 1, 8)
        const wait = Math.min(250 * Math.pow(2, quiet - 1), 12_000)
        restart = setTimeout(start, Math.max(wait, Math.min(250 + failures * 900, 6000)))
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
