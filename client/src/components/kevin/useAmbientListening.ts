import { useEffect, useRef, useState } from 'react'
import { isAboutProperties } from './propertyTalk'
import { canCaptureSpeech, startCapture, type CaptureSession } from './speechCapture'
import { pauseServerStt, serverSttAvailable, transcribeClip } from './serverStt'

/**
 * Hands-free: keep the microphone open while the page is on screen, and when
 * someone speaks to Kevin about property, wake him so he can answer without a tap.
 *
 * This is the only place the site listens continuously, so it is deliberately
 * narrow and honest:
 *  - The caller starts it on arrival (the browser asks for the microphone once,
 *    ever; after that only if it was allowed) and leaves a visible toggle to turn
 *    it off for good. `active` is true exactly while the microphone is open, so
 *    the UI can always show it.
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
 * Continuous: the microphone is opened once and stays open for as long as hands-free is on and the page is visible. Kevin
 * being busy (hearing, thinking, talking) no longer closes and reopens it; the audio is simply not used while he is, plus a
 * short moment after, so he never answers his own voice. `active` is therefore steady, not flickering.
 *
 * The better ear first: when the server can transcribe (ElevenLabs Scribe, see serverStt.ts) the microphone is watched and
 * each spoken sentence is cut out and sent to be turned into text. That hears more accents and languages, makes no
 * sound at all on a phone, and keeps every word, because a moment from before the first word is kept. It is limited
 * to 40 sentences an hour; past that, or if the server cannot be used, the browser's own recogniser takes over as below.
 *
 * No clicking sounds: phones play a small tone every time the browser's speech recogniser starts or stops, and
 * a recogniser that keeps reopening in a quiet room would chirp over and over. So while nothing is being said the
 * recogniser is NOT running at all; a plain microphone level meter watches instead (no sound, nothing sent
 * anywhere, nothing recorded). Only when someone actually starts speaking is the meter released and the
 * recogniser opened to hear the sentence. If the room is noisy but nobody is talking to Kevin, it waits longer
 * and longer before listening again. If a device cannot run the meter, the old restart loop is used, slowly.
 */

/** How long after Kevin stops talking the visitor's voice is again taken for the visitor's, not his own tail. */
const TAIL_AFTER_KEVIN_MS = 700
/** Sentences sent to be turned into text per hour while listening all day; past this the browser's own recogniser takes over. */
const MAX_CLIPS_PER_HOUR = 120

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
  // Kevin is busy: the microphone stays open but nothing heard now is used (see the effect below).
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const controls = useRef<{ setPaused: (p: boolean) => void } | null>(null)
  useEffect(() => {
    controls.current?.setPaused(paused)
  }, [paused])

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const Recognition = recognitionConstructor()
    if (!Recognition && !canCaptureSpeech()) {
      handlers.current.onProblem('unsupported')
      return
    }
    if (!visible) return

    let stopped = false
    let isPaused = pausedRef.current
    // Anything that began before this moment is Kevin's own voice or the tail of it: not used.
    let blockedUntil = isPaused ? Infinity : 0
    let usingFallback = false
    let recognition: any = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let meterTimer: ReturnType<typeof setInterval> | undefined
    let stream: MediaStream | null = null
    let audio: AudioContext | null = null
    let failures = 0
    let quiet = 0 // consecutive rounds that ended with nothing said to Kevin: each waits a little longer before listening again
    let session: CaptureSession | null = null
    let speechStartedAt = 0
    let sentThisHour: number[] = []

    /** The microphone is open from here until this effect ends: `active` does not follow Kevin's busy moments. */
    setActive(true)

    const releaseMeter = () => {
      clearInterval(meterTimer)
      meterTimer = undefined
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      void audio?.close().catch(() => {})
      audio = null
    }

    const usable = (startedAt: number) => !isPaused && startedAt >= blockedUntil

    /** One round with the recogniser: hear one sentence, then stop. Calls `done(heardSomething)` when it ends. */
    const listenOnce = (done: (consumed: boolean) => void) => {
      if (stopped || isPaused) return
      if (!Recognition) {
        handlers.current.onProblem('unsupported')
        return
      }
      const startedAt = Date.now()
      let woke = false
      let consumed = false
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        done(consumed)
      }
      recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.lang = bcp47 || navigator.language || 'en-GB'

      recognition.onstart = () => {
        failures = 0
      }
      recognition.onresult = (event: any) => {
        if (consumed || stopped || !usable(startedAt)) return
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
            quiet = 0
            handlers.current.onUtterance(text.trim())
            try {
              recognition.stop()
            } catch {
              /* already stopped */
            }
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
          setActive(false)
          handlers.current.onProblem('blocked')
        } else if (error !== 'no-speech' && error !== 'aborted') {
          failures++
        }
      }
      recognition.onend = finish
      try {
        recognition.start()
        // Safety: a round never lasts more than half a minute.
        timer = setTimeout(() => {
          try {
            recognition.stop()
          } catch {
            /* already stopped */
          }
        }, 30_000)
      } catch {
        failures++
        finish()
      }
    }

    const wait = (ms: number, then: () => void) => {
      clearTimeout(timer)
      timer = setTimeout(then, ms)
    }

    /** For devices that cannot run the level meter: reopen the recogniser, with short pauses. */
    const legacyLoop = () => {
      if (stopped || isPaused) return
      usingFallback = true
      listenOnce((consumed) => {
        if (stopped || isPaused) return
        quiet = consumed ? 0 : Math.min(quiet + 1, 4)
        wait(Math.max(400 * (quiet + 1), Math.min(250 + failures * 900, 6000)), legacyLoop)
      })
    }

    /** Watch the microphone level, silently. When someone starts to speak, let go of it and open the recogniser. */
    const watch = async () => {
      if (stopped || isPaused) return
      usingFallback = true
      const AudioCtx: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext
      if (!navigator.mediaDevices?.getUserMedia || !AudioCtx) {
        legacyLoop()
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      } catch (err: any) {
        if (stopped) return
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          stopped = true
          setActive(false)
          handlers.current.onProblem('blocked')
        } else {
          legacyLoop()
        }
        return
      }
      if (stopped || isPaused) {
        releaseMeter()
        return
      }
      try {
        audio = new AudioCtx()
        const source = audio.createMediaStreamSource(stream)
        const analyser = audio.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser) // never connected to the speakers: nothing is played
        const samples = new Float32Array(analyser.fftSize)
        let floor = 0.004
        let loud = 0
        meterTimer = setInterval(() => {
          analyser.getFloatTimeDomainData(samples)
          let sum = 0
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
          const rms = Math.sqrt(sum / samples.length)
          // The room's own hum sets the floor; speech has to stand clearly above it.
          if (rms < floor * 2) floor = floor * 0.97 + rms * 0.03
          const threshold = Math.max(0.02, floor * 4)
          loud = rms > threshold ? loud + 1 : Math.max(0, loud - 1)
          if (loud >= 4) {
            // About a fifth of a second of real speech.
            releaseMeter()
            listenOnce((consumed) => {
              if (stopped || isPaused) return
              quiet = consumed ? 0 : Math.min(quiet + 1, 5)
              // Nothing for Kevin was said: wait a little (1.5s, 2.4s ... up to 8s) so a noisy room cannot make the phone chirp.
              wait(consumed ? 800 : Math.min(1500 * Math.pow(1.6, quiet - 1), 8000), () => void watch())
            })
          }
        }, 50)
      } catch {
        releaseMeter()
        legacyLoop()
      }
    }

    /** Hand over to the browser's recogniser (the meter-gated way) when the server cannot be used. */
    const fallBack = () => {
      session?.stop()
      session = null
      usingFallback = true
      if (!stopped) void watch()
    }

    const serverSession = () => {
      session = startCapture({
        continuous: true,
        silenceMs: 1000,
        maxMs: 12_000,
        preRollMs: 700,
        onSpeechStart: () => {
          speechStartedAt = Date.now()
        },
        onError: (reason) => {
          if (reason === 'blocked') {
            stopped = true
            setActive(false)
            handlers.current.onProblem('blocked')
          } else fallBack()
        },
        onClip: (wav) => {
          // He was talking (or had only just stopped) when this began: it is his own voice, not the visitor's.
          if (!usable(speechStartedAt || Date.now())) return
          const now = Date.now()
          sentThisHour = sentThisHour.filter((t) => now - t < 3_600_000)
          if (sentThisHour.length >= MAX_CLIPS_PER_HOUR) {
            pauseServerStt(30)
            fallBack()
            return
          }
          sentThisHour.push(now)
          void transcribeClip(wav, bcp47).then((text) => {
            if (stopped) return
            if (text === null) {
              fallBack()
              return
            }
            // He began to answer, or was busy, while this was being turned into words: let it go.
            if (isPaused) return
            // Said, but not about property and not to him: let it pass, as a person in the room would.
            if (!isMeaningfulSpeech(text) || !handlers.current.relevant(text)) return
            handlers.current.onWake(text)
            handlers.current.onUtterance(text)
          })
        },
      })
    }

    /** Kevin is busy (hearing, thinking, talking) or free again. The server path just stops using what it hears; the browser path steps aside. */
    controls.current = {
      setPaused: (p: boolean) => {
        if (p === isPaused || stopped) return
        isPaused = p
        if (p) {
          blockedUntil = Infinity
          if (usingFallback) {
            clearTimeout(timer)
            releaseMeter()
            try {
              recognition?.abort()
            } catch {
              /* already stopped */
            }
          }
        } else {
          // A moment of grace so the end of his own voice is not taken for the visitor's.
          blockedUntil = Date.now() + TAIL_AFTER_KEVIN_MS
          if (usingFallback) wait(TAIL_AFTER_KEVIN_MS, () => void watch())
        }
      },
    }

    void (async () => {
      if (canCaptureSpeech() && (await serverSttAvailable())) {
        if (!stopped) serverSession()
      } else if (!isPaused) {
        void watch()
      } else {
        usingFallback = true // resumes by itself when he is free
      }
    })()

    return () => {
      stopped = true
      controls.current = null
      session?.stop()
      clearTimeout(timer)
      releaseMeter()
      try {
        recognition?.abort()
      } catch {
        /* already stopped */
      }
      setActive(false)
    }
  }, [enabled, visible, bcp47])

  return { active }
}
