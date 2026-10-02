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
    if (!Recognition && !canCaptureSpeech()) {
      handlers.current.onProblem('unsupported')
      return
    }
    if (paused || !visible) return

    let stopped = false
    let recognition: any = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let meterTimer: ReturnType<typeof setInterval> | undefined
    let stream: MediaStream | null = null
    let audio: AudioContext | null = null
    let failures = 0
    let quiet = 0 // consecutive rounds that ended with nothing said to Kevin: each waits longer before listening again

    const releaseMeter = () => {
      clearInterval(meterTimer)
      meterTimer = undefined
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      void audio?.close().catch(() => {})
      audio = null
    }

    /** One round with the recogniser: hear one sentence, then stop. Calls `done(heardSomething)` when it ends. */
    const listenOnce = (done: (consumed: boolean) => void) => {
      if (stopped) return
      if (!Recognition) {
        handlers.current.onProblem('unsupported')
        return
      }
      let woke = false
      let consumed = false
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        setActive(false)
        done(consumed)
      }
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

    /** The old way, for devices that cannot run the level meter: reopen the recogniser, slowly. */
    const legacyLoop = () => {
      if (stopped) return
      listenOnce((consumed) => {
        if (stopped) return
        quiet = consumed ? 0 : Math.min(quiet + 1, 8)
        const pause = Math.min(1000 * Math.pow(2, quiet), 30_000)
        wait(Math.max(pause, Math.min(250 + failures * 900, 6000)), legacyLoop)
      })
    }

    /** Watch the microphone level, silently. When someone starts to speak, let go of it and open the recogniser. */
    const watch = async () => {
      if (stopped) return
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
          handlers.current.onProblem('blocked')
        } else {
          legacyLoop()
        }
        return
      }
      if (stopped) {
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
        setActive(true)
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
            setActive(false)
            listenOnce((consumed) => {
              if (stopped) return
              quiet = consumed ? 0 : Math.min(quiet + 1, 6)
              // Nothing for Kevin was said: be deaf for a while (3s, 6s, ... up to 60s) so a noisy room cannot make it chirp.
              wait(consumed ? 1500 : Math.min(3000 * Math.pow(2, quiet - 1), 60_000), () => void watch())
            })
          }
        }, 50)
      } catch {
        releaseMeter()
        legacyLoop()
      }
    }
    let session: CaptureSession | null = null
    let sentThisHour: number[] = []

    /** Hand over to the browser's recogniser (the meter-gated way) when the server cannot be used. */
    const fallBack = () => {
      session?.stop()
      session = null
      setActive(false)
      if (!stopped) void watch()
    }

    const serverSession = () => {
      setActive(true)
      session = startCapture({
        continuous: true,
        silenceMs: 1000,
        maxMs: 12_000,
        preRollMs: 700,
        onError: (reason) => {
          if (reason === 'blocked') {
            stopped = true
            setActive(false)
            handlers.current.onProblem('blocked')
          } else fallBack()
        },
        onClip: (wav) => {
          const now = Date.now()
          sentThisHour = sentThisHour.filter((t) => now - t < 3_600_000)
          if (sentThisHour.length >= 40) {
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
            // Said, but not about property and not to him: let it pass, as a person in the room would.
            if (!isMeaningfulSpeech(text) || !handlers.current.relevant(text)) return
            handlers.current.onWake(text)
            handlers.current.onUtterance(text)
          })
        },
      })
    }

    void (async () => {
      if (canCaptureSpeech() && (await serverSttAvailable())) {
        if (!stopped) serverSession()
      } else {
        void watch()
      }
    })()

    return () => {
      stopped = true
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
  }, [enabled, paused, visible, bcp47])

  return { active }
}
