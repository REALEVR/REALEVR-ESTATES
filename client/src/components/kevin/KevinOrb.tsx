import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Globe, MessageCircle, Mic, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import { apiRequest } from '@/lib/queryClient'
import {
  KEVIN_LANGUAGES,
  hasBuiltInIntro,
  isRtl,
  languageFromBrowser,
  languageFromText,
  stringsFor,
  type KevinLanguage,
} from './kevinLanguages'
import { chime, useKevinVoice } from './useKevinVoice'
import { regionalTag } from './propertyTalk'
import { usePlace } from '@/lib/place'
import { useAmbientListening } from './useAmbientListening'
import { interestText, recordInterest, useKevinWhatsapp, whatsappHref } from './useKevinWhatsapp'
import Orb from './Orb'
import ResultCards from './ResultCards'
import VoiceStage, { type VoicePhase } from './VoiceStage'
import type { KevinAction, KevinCard } from './kevinTypes'
import './kevin.css'

/**
 * Kevin: the site's multilingual concierge, presented as a floating orb.
 *
 * First visit: after a short pause (and once the cookie notice is out of the
 * way) he introduces himself in a small bubble and asks which language the
 * visitor would like to speak. Any language works: the chips are shortcuts,
 * and a typed language is passed straight to the AI. After that he chats, and
 * speaks his replies aloud when the device has a voice for the language
 * (see useKevinVoice for what that depends on), with a mic for talking back.
 *
 * Voice mode (the waveform button, or press-and-hold on the orb) turns him
 * into a hands-free assistant in the manner of a phone's: you speak, the words
 * appear as they are recognised, he answers in a sentence, does the thing you
 * asked (shows homes, opens one, takes you to a page), and then listens again
 * for a follow-up until you go quiet or say stop. Tap the orb while he talks to
 * interrupt him.
 *
 * He talks to the same GENE backend as every other assistant here
 * (/api/gene/chat), asking for the Kevin persona; signed-in users also get a
 * shortcut to their personal "My Agent" panel, which used to have its own
 * floating button in this corner.
 */

const LANG_KEY = 'realevr_kevin_lang'
const GREETED_KEY = 'realevr_kevin_greeted'
const ASKED_KEY = 'realevr_kevin_asked_language' // per browser session: has he asked which language yet?
const LANGUAGE_QUESTION = 'Hello, I’m Kevin, your guide to RealEVR Estates. Which language would you like to speak?'
const MUTED_KEY = 'realevr_kevin_muted'
const SESSION_KEY = 'realevr_gene_chat_session_id' // shared with the older widget so a thread survives
const HANDSFREE_KEY = 'realevr_kevin_handsfree' // '0' once the visitor switched hands-free off; otherwise it starts on arrival
const MIC_ASKED_KEY = 'realevr_kevin_mic_asked' // '1' once we have opened the microphone (so the browser's question is asked once, ever)
const INTAKE_KEY = 'realevr_kevin_intake' // 'done' once he has what he needs from this visitor (or they said no)

// Same rule the server applies before putting a language name into the AI's
// instructions. Checked here too so a rejected name gets a visible message
// instead of being silently ignored. (Built from a string for the tsc target.)
const SAFE_LANGUAGE_NAME = new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M} '’().,-]{0,39}$", 'u')

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private browsing etc.: Kevin just won't remember */
  }
}
function readStoredLanguage(): KevinLanguage | null {
  try {
    const raw = readStore(LANG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.name === 'string' ? (parsed as KevinLanguage) : null
  } catch {
    return null
  }
}
function getSessionId(): string {
  const existing = readStore(SESSION_KEY)
  if (existing) return existing
  const fresh = crypto.randomUUID()
  writeStore(SESSION_KEY, fresh)
  return fresh
}

type Message =
  | { id: number; kind: 'text'; role: 'kevin' | 'user'; text: string }
  | { id: number; kind: 'note'; text: string }
  | { id: number; kind: 'picker' }
  | { id: number; kind: 'cards'; cards: KevinCard[] }
  | { id: number; kind: 'whatsapp' }

// A message before it's been given an id (Omit distributed over the union, so
// each variant keeps its own fields).
type NewMessage = Message extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never

let messageId = 0
const nextId = () => ++messageId

function LanguagePicker({ onPick }: { onPick: (lang: KevinLanguage) => void }) {
  const [custom, setCustom] = useState('')
  const [problem, setProblem] = useState(false)

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault()
    const lang = languageFromText(custom)
    if (!lang) return
    if (!SAFE_LANGUAGE_NAME.test(lang.name)) {
      setProblem(true)
      return
    }
    onPick(lang)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {KEVIN_LANGUAGES.map((l) => (
          <button
            key={l.name}
            type="button"
            lang={l.code ?? undefined}
            onClick={() => onPick(l)}
            className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm text-white/90 transition hover:border-[#f5c469]/70 hover:bg-[#f5c469]/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f5c469]"
          >
            {l.native}
          </button>
        ))}
      </div>
      <form onSubmit={submitCustom} className="mt-2.5 flex gap-1.5">
        <input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value)
            setProblem(false)
          }}
          placeholder="Another language… (e.g. Runyankole)"
          aria-label="Type another language"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-base text-white placeholder:text-white/45 focus:border-[#f5c469]/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!custom.trim()}
          className="rounded-full bg-[#f5c469] px-3.5 py-1.5 text-sm font-medium text-[#1b1305] transition enabled:hover:brightness-110 disabled:opacity-40"
        >
          Go
        </button>
      </form>
      {problem && <p className="mt-1.5 text-xs text-[#ffb4a8]">Just type the name of the language, like “Runyankole”.</p>}
    </div>
  )
}

export default function KevinOrb() {
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState(false)
  const [lang, setLang] = useState<KevinLanguage | null>(readStoredLanguage)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [muted, setMuted] = useState(() => readStore(MUTED_KEY) === '1')
  const [changingLanguage, setChangingLanguage] = useState(false)
  // The welcome conversation: name, what they need, how to reach them. Asked once.
  const [intakeDone, setIntakeDone] = useState(() => readStore(INTAKE_KEY) === 'done')
  const [, navigate] = useLocation()

  // Hands-free: Kevin wakes when someone speaks. Opt-in, remembered, always visible while on.
  const [handsFreeOn, setHandsFreeOn] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [waking, setWaking] = useState(false)
  const [touched, setTouched] = useState(
    () => typeof navigator !== 'undefined' && !!(navigator as any).userActivation?.hasBeenActive,
  )
  // Browsers refuse to play sound before the visitor's first tap, so a reply that
  // arrives sooner waits (on screen, in text) and is spoken at that first tap.
  const [needsTap, setNeedsTap] = useState(false)
  // WhatsApp: the owner's number, who the visitor is (for the message), and whether Kevin just offered it.
  const waNumber = useKevinWhatsapp()
  const [leadName, setLeadName] = useState<string | null>(null)
  const [offerWhatsapp, setOfferWhatsapp] = useState(false)

  // Voice mode
  const [voiceMode, setVoiceMode] = useState(false)
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [heard, setHeard] = useState('')
  const [lastReply, setLastReply] = useState('')
  const [cards, setCards] = useState<KevinCard[]>([])

  // Async flows below outlive the render they started in; refs keep them
  // reading the CURRENT language and mute setting, not a stale copy.
  const langRef = useRef(lang)
  langRef.current = lang
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  // A signed-in visitor's account already says who they are and how to reach them: no welcome questions.
  const intakeDoneRef = useRef(intakeDone)
  intakeDoneRef.current = intakeDone || !!user
  const touchedRef = useRef(touched)
  touchedRef.current = touched
  const pendingSpeech = useRef<{ text: string; target: KevinLanguage | null } | null>(null)
  const retryAfterTap = useRef(false)
  const sessionIdRef = useRef<string>()
  if (!sessionIdRef.current) sessionIdRef.current = getSessionId()
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const noVoiceNotedFor = useRef<string | null>(null)
  const voiceModeRef = useRef(false)
  voiceModeRef.current = voiceMode
  // Listings on screen, sent with each message so "open the second one" is understood.
  const shownRef = useRef<{ id: number; title: string }[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout>>()
  const longPressed = useRef(false)

  // The accent the speech engine should expect, from where the visitor is (Kenyan English around Kampala, etc.).
  const { place, abroad } = usePlace()
  // A guess from nothing (the platform's home country) is not a reason to expect an accent.
  const placeRef = useRef({ country: place.source === 'default' ? null : place.country, abroad })
  placeRef.current = { country: place.source === 'default' ? null : place.country, abroad }
  const tagFor = (l: KevinLanguage | null | undefined) => regionalTag(l?.bcp47 ?? null, placeRef.current.country, placeRef.current.abroad)
  const voice = useKevinVoice(tagFor(lang))
  const strings = stringsFor(lang)

  const push = useCallback((message: NewMessage) => {
    setMessages((prev) => [...prev, { ...message, id: nextId() } as Message])
  }, [])

  // Say it aloud if that's wanted and possible; otherwise, once per language,
  // tell the visitor Kevin is text-only for this one instead of just going quiet.
  // Returns whether he is actually speaking; `onDone` runs when he has finished.
  const say = useCallback(
    (text: string, target: KevinLanguage | null, onDone?: () => void): boolean => {
      if (mutedRef.current || !voice.canSpeak) return false
      if (!touchedRef.current) {
        pendingSpeech.current = { text, target }
        setNeedsTap(true)
        return false
      }
      const tag = tagFor(target)
      if (voice.speak(text, tag, onDone)) return true
      const key = target?.name ?? ''
      if (target && noVoiceNotedFor.current !== key && !voice.hasVoiceFor(tag)) {
        noVoiceNotedFor.current = key
        push({ kind: 'note', text: stringsFor(target).noVoice.replace('{lang}', target.native) })
      }
      return false
    },
    [voice, push],
  )

  const kevinSays = useCallback(
    (text: string, target: KevinLanguage | null = langRef.current, onDone?: () => void): boolean => {
      push({ kind: 'text', role: 'kevin', text })
      setLastReply(text)
      return say(text, target, onDone)
    },
    [push, say],
  )

  // While the panel is open, track the part of the screen that is really visible
  // (the on-screen keyboard shrinks it) and stop the page behind from scrolling
  // when the panel is a full-screen sheet.
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--kevin-vh', `${vv ? vv.height : window.innerHeight}px`)
      root.style.setProperty('--kevin-top', `${vv ? vv.offsetTop : 0}px`)
      // Follow the visible width too: a page a few pixels wider than the screen
      // makes the layout viewport wider than what the phone actually shows.
      root.style.setProperty('--kevin-vw', `${vv ? vv.width : window.innerWidth}px`)
      root.style.setProperty('--kevin-left', `${vv ? vv.offsetLeft : 0}px`)
      endRef.current?.scrollIntoView({ block: 'end' })
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    const asSheet = window.matchMedia('(max-width: 767px), (max-height: 520px)').matches
    const before = document.body.style.overflow
    if (asSheet) document.body.style.overflow = 'hidden'
    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--kevin-vh')
      root.style.removeProperty('--kevin-top')
      root.style.removeProperty('--kevin-vw')
      root.style.removeProperty('--kevin-left')
      document.body.style.overflow = before
    }
  }, [open])

  // ---- First-visit greeting ----
  // As soon as someone arrives Kevin says hello, with a short beat for the page to
  // appear first. (He used to wait for the cookie notice to be answered; the
  // greeting now sits above it instead, so it is never held back.)
  // He asks again at the start of every visit until a language has been chosen; once chosen, never.
  useEffect(() => {
    if (langRef.current) return
    try {
      if (sessionStorage.getItem(ASKED_KEY) === '1') return
    } catch {
      /* storage blocked: ask on every page load rather than never */
    }
    const timer = setTimeout(() => {
      if (langRef.current) return
      try {
        sessionStorage.setItem(ASKED_KEY, '1')
      } catch {
        /* see above */
      }
      writeStore(GREETED_KEY, '1')
      setBubble(true)
    }, 900)
    return () => clearTimeout(timer)
  }, [])

  // ...and says the question aloud, in his own voice. Browsers keep a page silent until the first
  // tap, so on arrival it is spoken at that tap (see pendingSpeech); never after the bubble is gone.
  const askedAloud = useRef(false)
  useEffect(() => {
    if (!bubble) {
      if (pendingSpeech.current?.text === LANGUAGE_QUESTION) pendingSpeech.current = null
      return
    }
    if (langRef.current || askedAloud.current || !voice.canSpeak) return
    askedAloud.current = true
    say(LANGUAGE_QUESTION, KEVIN_LANGUAGES[0])
  }, [bubble, say, voice.canSpeak])

  // An untouched greeting shouldn't hang over the page forever.
  useEffect(() => {
    if (!bubble) return
    const t = setTimeout(() => setBubble(false), 45_000)
    return () => clearTimeout(t)
  }, [bubble])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, open])

  // Opening the panel: if we don't have a language yet, that's the first thing to ask.
  useEffect(() => {
    if (!open) return
    setMessages((prev) => {
      if (prev.length > 0) return prev
      if (langRef.current) {
        const words = stringsFor(langRef.current)
        return [{ id: nextId(), kind: 'text', role: 'kevin', text: intakeDoneRef.current ? words.intro : words.introIntake }]
      }
      return [{ id: nextId(), kind: 'picker' }]
    })
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [open])

  const exitVoiceMode = () => {
    voice.stop()
    voice.stopListening()
    setVoiceMode(false)
    voiceModeRef.current = false
    setPhase('idle')
    setHeard('')
  }

  const closePanel = () => {
    exitVoiceMode()
    setOpen(false)
  }

  // Go somewhere on the site. The panel steps aside so the page is visible, but
  // whatever Kevin is still saying carries on.
  const goTo = (path: string) => {
    voice.stopListening()
    setVoiceMode(false)
    voiceModeRef.current = false
    setPhase('idle')
    setOpen(false)
    navigate(path)
  }
  const openCard = (id: number) => goTo(`/property/${id}`)

  const runAction = (action: KevinAction | null | undefined) => {
    if (!action) return
    if (action.type === 'open') goTo(`/property/${action.propertyId}`)
    else if (action.type === 'go' && typeof action.path === 'string' && action.path.startsWith('/')) goTo(action.path)
  }

  const chooseLanguage = async (picked: KevinLanguage) => {
    voice.stop()
    setLang(picked)
    langRef.current = picked
    writeStore(LANG_KEY, JSON.stringify(picked))
    writeStore(GREETED_KEY, '1')
    setBubble(false)
    setChangingLanguage(false)
    setOpen(true)
    setMessages((prev) => prev.filter((m) => m.kind !== 'picker'))

    let intro = intakeDoneRef.current ? stringsFor(picked).intro : stringsFor(picked).introIntake
    if (!hasBuiltInIntro(picked)) {
      // Languages we don't ship an introduction for: the AI writes it.
      setBusy(true)
      try {
        const res = await apiRequest('POST', '/api/gene/chat', {
          intro: true,
          intake: !intakeDoneRef.current,
          persona: 'kevin',
          language: { code: picked.code, name: picked.name },
        })
        const data = await res.json()
        if (typeof data.reply === 'string' && data.reply.trim()) intro = data.reply.trim()
      } catch {
        /* keep the built-in English introduction */
      } finally {
        setBusy(false)
      }
    }
    kevinSays(intro, picked)
  }

  const send = async (raw: string, opts: { voice?: boolean } = {}) => {
    const message = raw.trim()
    if (!message || busy) return
    voice.stop()
    setInput('')
    setLastReply('')
    setMessages((prev) => [...prev.filter((m) => m.kind !== 'picker'), { id: nextId(), kind: 'text', role: 'user', text: message }])
    setBusy(true)
    setOfferWhatsapp(false)
    if (opts.voice) setPhase('thinking')
    try {
      const current = langRef.current
      const res = await apiRequest('POST', '/api/gene/chat', {
        message,
        sessionId: sessionIdRef.current,
        persona: 'kevin',
        voice: opts.voice === true,
        shown: shownRef.current,
        intake: !intakeDoneRef.current,
        ...(current ? { language: { code: current.code, name: current.name } } : {}),
      })
      const data = await res.json()
      if (typeof data.sessionId === 'string') sessionIdRef.current = data.sessionId
      // He has what he needed (or they said no): stop asking, for good.
      if (data.lead && (data.lead.complete || data.lead.declined)) {
        writeStore(INTAKE_KEY, 'done')
        setIntakeDone(true)
      }

      if (typeof data.lead?.name === 'string' && data.lead.name) setLeadName(data.lead.name)

      const found: KevinCard[] = Array.isArray(data.results) ? data.results : []
      if (data.action?.type === 'results') {
        setCards(found)
        shownRef.current = found.map((c) => ({ id: c.id, title: c.title }))
        if (found.length) push({ kind: 'cards', cards: found })
      }

      const text = typeof data.reply === 'string' && data.reply ? data.reply : stringsFor(current).error
      // In voice mode, once he has finished speaking he listens again: that is
      // what makes it a conversation rather than a series of button presses.
      if (opts.voice) setHeard('') // the answer takes the place of the words they said
      const spoke = kevinSays(text, current, opts.voice ? () => actionsRef.current.beginListening(true) : undefined)
      if (opts.voice) setPhase(spoke ? 'speaking' : 'idle')
      // The button comes right after what he said about it.
      if (data.whatsapp === true) {
        setOfferWhatsapp(true)
        push({ kind: 'whatsapp' })
      }
      runAction(data.action)
    } catch {
      kevinSays(stringsFor(langRef.current).error)
      if (opts.voice) setPhase('idle')
    } finally {
      setBusy(false)
    }
  }

  // ---- Voice mode ----------------------------------------------------------
  // The functions the speech callbacks call live in a ref, because those
  // callbacks fire seconds later from the engine, long after the render whose
  // closures created them.
  const actionsRef = useRef({ beginListening: (_followUp: boolean) => {} })

  // One finished sentence from the visitor in voice mode (however it was heard).
  const handleUtterance = (text: string) => {
    setWaking(false)
    setHeard(text)
    // The few words that mean "never mind" end the conversation quietly.
    if (/^(stop|cancel|never ?mind|that'?s (all|it)|enough)[.!\s]*$/i.test(text)) {
      chime('end')
      setPhase('idle')
      setHeard('')
      return
    }
    void send(text, { voice: true })
  }

  const beginListening = (followUp: boolean) => {
    if (!voice.canListen || !voiceModeRef.current) return
    setHeard('')
    setPhase('listening')
    const quiet = mutedRef.current
    if (!quiet) chime('start')
    // Start the microphone a beat after the chime so it doesn't hear it.
    setTimeout(() => {
      if (!voiceModeRef.current) return
      voice.listen({
        onInterim: (text) => setHeard(text),
        onFinal: (text) => handleUtterance(text),
        onEnd: ({ heard: gotSomething, error }) => {
          if (gotSomething) return
          setPhase('idle')
          if (error === 'not-allowed' || error === 'service-not-allowed') {
            push({ kind: 'note', text: stringsFor(langRef.current).micBlocked })
            exitVoiceMode()
          } else if (!followUp && error !== 'aborted') {
            // First attempt and nothing usable: say so, as a person would. After a
            // follow-up prompt, silence just means the conversation is over.
            const strings = stringsFor(langRef.current)
            setLastReply(strings.didntCatch)
            say(strings.didntCatch, langRef.current)
          } else if (followUp) {
            chime('end')
          }
        },
      })
    }, quiet ? 0 : 230)
  }
  actionsRef.current = { beginListening }

  const startVoiceMode = () => {
    setBubble(false)
    setOpen(true)
    if (!langRef.current) return // a language comes first; the picker is already showing
    if (mutedRef.current) {
      // Choosing to talk to him means wanting to hear him back.
      setMuted(false)
      mutedRef.current = false
      writeStore(MUTED_KEY, '0')
    }
    setChangingLanguage(false)
    setVoiceMode(true)
    voiceModeRef.current = true
    setLastReply('')
    beginListening(false)
  }

  const onStageOrbTap = () => {
    if (phase === 'thinking') return
    if (phase === 'speaking') {
      // Interrupting him, the way you talk over a phone assistant.
      voice.stop()
      beginListening(false)
    } else if (phase === 'listening') {
      voice.stopListening()
    } else {
      beginListening(false)
    }
  }

  // ---- Hands-free ----------------------------------------------------------
  // Listening starts on arrival, and the browser's microphone question is asked ONCE: the first time
  // we open the microphone we note it (MIC_ASKED_KEY), and on every later visit we start only if the
  // browser has already said yes, so nobody is asked again (or sees a prompt on a "not now"). A blocked
  // microphone is left alone. It reacts only to talk about property or to his name (see
  // useAmbientListening), the server keeps only real-estate conversation (see server/gene/chat.ts),
  // the orb's badge shows whenever the microphone is open, and the toggle turns it off for good.
  useEffect(() => {
    if (readStore(HANDSFREE_KEY) === '0') return
    if (!voice.canListen) return
    let cancelled = false
    const startOnce = () => {
      if (cancelled) return
      if (readStore(MIC_ASKED_KEY) === '1') return // asked on an earlier visit and not allowed since: never again
      writeStore(MIC_ASKED_KEY, '1')
      setHandsFreeOn(true) // the browser asks here, once
    }
    const permissions = (navigator as any).permissions
    if (!permissions?.query) {
      startOnce()
      return
    }
    permissions
      .query({ name: 'microphone' })
      .then((status: PermissionStatus) => {
        if (cancelled) return
        if (status.state === 'granted') setHandsFreeOn(true)
        else if (status.state === 'prompt') startOnce()
      })
      .catch(() => startOnce())
    return () => {
      cancelled = true
    }
  }, [voice.canListen])

  // The first tap or key press: sound is allowed from here on.
  useEffect(() => {
    if (touched) return
    const mark = () => setTouched(true)
    window.addEventListener('pointerdown', mark, { once: true, capture: true })
    window.addEventListener('keydown', mark, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', mark, true)
      window.removeEventListener('keydown', mark, true)
    }
  }, [touched])

  // ...so say what was waiting, and retry a microphone the browser would only open after a tap (Safari).
  useEffect(() => {
    if (!touched) return
    const waiting = pendingSpeech.current
    if (waiting) {
      pendingSpeech.current = null
      setNeedsTap(false)
      say(waiting.text, waiting.target)
    }
    if (retryAfterTap.current && readStore(HANDSFREE_KEY) !== '0') {
      retryAfterTap.current = false
      setHandsFreeOn(true)
    }
  }, [touched, say])

  // A wake that never turned into a full sentence should not leave "listening" on screen.
  useEffect(() => {
    if (!waking) return
    const t = setTimeout(() => setWaking(false), 8000)
    return () => clearTimeout(t)
  }, [waking])

  const ensureVoiceMode = () => {
    setBubble(false)
    setOpen(true)
    setChangingLanguage(false)
    setVoiceMode(true)
    voiceModeRef.current = true
  }

  // The visitor's choice: stays off on later visits too.
  // Someone who just starts talking has already chosen a language: their browser's.
  const adoptBrowserLanguage = () => {
    if (langRef.current) return
    const guess = languageFromBrowser()
    setLang(guess)
    langRef.current = guess
    writeStore(LANG_KEY, JSON.stringify(guess))
    setMessages((prev) => prev.filter((m) => m.kind !== 'picker'))
  }

  const turnOffHandsFree = () => {
    writeStore(HANDSFREE_KEY, '0')
    setHandsFreeOn(false)
    setWaking(false)
  }
  // Used when the browser, not the visitor, stopped it: no lasting choice is recorded.
  const pauseHandsFree = () => {
    setHandsFreeOn(false)
    setWaking(false)
  }
  const confirmHandsFree = () => {
    writeStore(HANDSFREE_KEY, '1')
    setHandsFreeOn(true)
    setTouched(true) // this tap is the gesture
    setConsentOpen(false)
  }

  const ambient = useAmbientListening({
    enabled: handsFreeOn && voice.canListen,
    // Kevin is already in the middle of something (hearing you, thinking, talking): the mic is his.
    paused: busy || voice.speaking || voice.listening || phase !== 'idle',
    bcp47: tagFor(lang ?? languageFromBrowser()),
    onWake: (interim) => {
      adoptBrowserLanguage()
      ensureVoiceMode()
      setWaking(true)
      setHeard(interim)
    },
    onUtterance: (text) => {
      adoptBrowserLanguage()
      if (!voiceModeRef.current) ensureVoiceMode()
      handleUtterance(text)
    },
    onProblem: (problem) => {
      pauseHandsFree()
      if (problem !== 'blocked') return
      // Some browsers only open the microphone after a tap: try once more at the first one.
      if (!touchedRef.current) retryAfterTap.current = true
      else push({ kind: 'note', text: stringsFor(langRef.current).micBlocked })
    },
  })

  // "Message the owner": about a home when there is one on screen, else in general.
  const generalWhatsapp = () => {
    const first = shownRef.current[0]
    const who = leadName ? `Hi, I'm ${leadName}. ` : 'Hi! '
    return waNumber
      ? whatsappHref(
          waNumber,
          first
            ? `${who}I'm interested in "${first.title}" on RealEVR Estates: ${window.location.origin}/property/${first.id}`
            : `${who}I'm interested in a property on RealEVR Estates.`,
        )
      : '#'
  }
  const tapGeneralWhatsapp = () => {
    const first = shownRef.current[0]
    if (first) recordInterest(sessionIdRef.current, first.id)
  }
  const cardWhatsapp = waNumber
    ? {
        label: 'WhatsApp', // the card is narrow: the brand name says it
        href: (c: KevinCard) => whatsappHref(waNumber, interestText(c, leadName)),
        onTap: (c: KevinCard) => recordInterest(sessionIdRef.current, c.id),
      }
    : null

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    writeStore(MUTED_KEY, next ? '1' : '0')
    if (next) voice.stop()
  }

  // Other parts of the site (the My Agent panel) hand the conversation to Kevin with this event.
  useEffect(() => {
    const openKevin = () => {
      setBubble(false)
      setOpen(true)
    }
    window.addEventListener('realevr:open-kevin', openKevin)
    return () => window.removeEventListener('realevr:open-kevin', openKevin)
  }, [])

  const openMyAgent = () => {
    closePanel()
    window.dispatchEvent(new Event('realevr:open-agent'))
  }

  const showPicker = changingLanguage
  const rtl = isRtl(lang)

  return (
    <>
      {/* The orb. Centre sits 3rem in from the right edge, the same line as the
          WhatsApp and scroll-to-top buttons above it, so the column is straight. */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false
              return
            }
            setBubble(false)
            setOpen(true)
          }}
          // Press and hold to talk: the quick way into voice mode.
          onPointerDown={() => {
            longPressed.current = false
            if (!voice.canListen || !lang) return
            pressTimer.current = setTimeout(() => {
              longPressed.current = true
              startVoiceMode()
            }, 450)
          }}
          onPointerUp={() => clearTimeout(pressTimer.current)}
          onPointerCancel={() => clearTimeout(pressTimer.current)}
          onContextMenu={(e) => e.preventDefault()}
          onPointerLeave={() => clearTimeout(pressTimer.current)}
          aria-label="Chat with Kevin, your RealEVR concierge. Press and hold to talk."
          className="group fixed select-none [-webkit-touch-callout:none] bottom-[var(--fab-row-1)] right-3 z-40 flex w-16 flex-col items-center gap-1.5 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5c469] md:bottom-5 md:right-4"
        >
          <span className="relative block h-11 w-11 md:h-12 md:w-12">
            <Orb speaking={voice.speaking || phase === 'speaking'} listening={voice.listening} thinking={busy} />
          </span>
          {/* His name floats under the dot. The dark pill keeps it readable over light and dark pages alike. */}
          <span className="rounded-full bg-[#0d1024]/85 px-2.5 py-0.5 font-display text-[11px] font-semibold tracking-wide text-white shadow-md backdrop-blur">
            Kevin
          </span>
          {ambient.active && (
            <span
              className="pointer-events-none absolute left-2 top-0 grid h-5 w-5 place-items-center rounded-full bg-[#f5c469] text-[#1b1305] shadow"
              title={strings.handsFreeActive}
            >
              <Mic size={11} />
              <span className="sr-only">{strings.handsFreeActive}</span>
            </span>
          )}
          <span className="pointer-events-none absolute right-full top-5 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#0d1024]/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 md:block">
            {voice.canListen && lang ? 'Ask Kevin · hold to talk' : 'Ask Kevin'}
          </span>
        </button>
      )}

      {/* First-visit greeting */}
      {bubble && !open && (
        <div
          role="dialog"
          aria-label="Kevin says hello"
          className="kevin-pop fixed bottom-[calc(var(--fab-row-1)+4.25rem)] right-3 z-[60] w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-white/10 bg-[#0d1024]/95 p-4 text-white shadow-2xl backdrop-blur-xl md:bottom-[6.25rem] md:right-4"
        >
          <button
            type="button"
            onClick={() => setBubble(false)}
            aria-label="Dismiss"
            className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
          <div className="flex items-start gap-3 pr-5">
            <span className="mt-0.5 block h-9 w-9 shrink-0">
              <Orb mini />
            </span>
            <p className="text-sm leading-relaxed text-white/90">
              <span className="font-display font-semibold text-white">Hello, I’m Kevin</span>, your guide to RealEVR Estates.
              Which language would you like to speak?
            </p>
          </div>
          <div className="mt-3">
            <LanguagePicker onPick={chooseLanguage} />
          </div>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Kevin, your RealEVR concierge"
          onKeyDown={(e) => e.key === 'Escape' && closePanel()}
          className="kevin-panel kevin-pop bg-[radial-gradient(120%_80%_at_0%_0%,rgba(79,70,229,0.28),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(45,212,191,0.18),transparent_55%)] bg-[#0b0d1c]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <header className="kevin-head flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span className="relative block h-10 w-10 shrink-0">
              <Orb mini speaking={voice.speaking} listening={voice.listening} thinking={busy} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-semibold tracking-wide">Kevin</span>
                {voice.speaking && (
                  <span className="kevin-bars is-on" aria-hidden="true">
                    <span /><span /><span /><span /><span />
                  </span>
                )}
              </div>
              <p className="kevin-sub truncate text-xs text-white/60">Your RealEVR concierge</p>
            </div>
            {voice.canListen && lang && !voiceMode && (
              <button
                type="button"
                onClick={startVoiceMode}
                title={strings.talkToKevin}
                aria-label={strings.talkToKevin}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#f5c469] transition hover:bg-white/10"
              >
                <AudioLines size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </header>

          {/* Language, picks and sound live on their own row, so the title is never squeezed. */}
          <div className="kevin-tools flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <button
              type="button"
              onClick={() => setChangingLanguage((v) => !v)}
              aria-expanded={showPicker}
              title="Change language"
              className="flex h-10 min-w-0 max-w-[60%] items-center gap-2 rounded-full border border-white/15 px-3.5 text-sm text-white/90 transition hover:border-[#f5c469]/70 hover:text-white"
            >
              <Globe size={16} className="shrink-0" />
              <span className="truncate" lang={lang?.code ?? undefined}>{lang?.native ?? 'Language'}</span>
            </button>
            <span className="flex-1" />
            {voice.canListen && lang && (
              <button
                type="button"
                onClick={() => (handsFreeOn ? turnOffHandsFree() : setConsentOpen((v) => !v))}
                aria-pressed={handsFreeOn}
                aria-label={strings.handsFreeLabel}
                title={handsFreeOn ? strings.handsFreeActive : strings.handsFreeLabel}
                className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/10 ${
                  handsFreeOn ? 'bg-[#f5c469]/15 text-[#f5c469]' : 'text-white/75 hover:text-white'
                }`}
              >
                <Mic size={19} />
                {ambient.active && <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-[#f5c469]" />}
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={openMyAgent}
                title="My picks and alerts"
                aria-label="Open my picks and alerts"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-[#f5c469]"
              >
                <Sparkles size={19} />
              </button>
            )}
            {waNumber && (
              <a
                href={generalWhatsapp()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={tapGeneralWhatsapp}
                title={strings.whatsapp}
                aria-label={strings.whatsapp}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#25D366]/85 transition hover:bg-white/10 hover:text-[#25D366]"
              >
                <MessageCircle size={19} />
              </a>
            )}
            {voice.canSpeak && (
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? 'Let Kevin speak aloud' : 'Mute Kevin'}
                title={muted ? 'Let Kevin speak aloud' : 'Mute Kevin'}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
            )}
          </div>

          {needsTap && (
            <button
              type="button"
              onClick={() => setTouched(true)}
              className="kevin-rise flex min-h-11 w-full items-center justify-center gap-2 border-b border-white/10 bg-[#f5c469]/10 px-4 py-2 text-sm font-medium text-[#f5c469]"
            >
              <Volume2 size={16} aria-hidden="true" />
              {strings.tapToHear}
            </button>
          )}

          {consentOpen && !handsFreeOn && (
            <div className="kevin-rise border-b border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-sm leading-relaxed text-white/85">{strings.handsFreeOffer}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmHandsFree}
                  className="min-h-11 rounded-full bg-[#f5c469] px-4 text-sm font-semibold text-[#1b1305] transition hover:brightness-110"
                >
                  {strings.handsFreeOn}
                </button>
                <button
                  type="button"
                  onClick={() => setConsentOpen(false)}
                  className="min-h-11 rounded-full border border-white/15 px-4 text-sm text-white/80 transition hover:text-white"
                >
                  {strings.handsFreeNotNow}
                </button>
              </div>
            </div>
          )}

          {showPicker && (
            <div className="kevin-rise border-b border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-white/50">Choose a language</p>
              <LanguagePicker onPick={chooseLanguage} />
            </div>
          )}

          {voiceMode ? (
            <VoiceStage
              phase={waking ? 'listening' : phase}
              idleLabel={ambient.active ? strings.handsFreeActive : undefined}
              heard={heard}
              reply={lastReply}
              cards={cards}
              strings={strings}
              hint={lang?.code === 'en' ? 'Two bedroom homes in Kololo under three million' : null}
              notice={voice.canSpeak && !voice.hasVoiceFor() ? strings.noVoice.replace('{lang}', lang?.native ?? '') : null}
              dir={rtl ? 'rtl' : 'auto'}
              onOrbTap={onStageOrbTap}
              onOpenCard={openCard}
              onType={exitVoiceMode}
              cardWhatsapp={cardWhatsapp}
              offer={waNumber && offerWhatsapp ? { label: strings.whatsapp, href: generalWhatsapp(), onTap: tapGeneralWhatsapp } : null}
            />
          ) : (
            <>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((m) => {
              if (m.kind === 'note') {
                return (
                  <p key={m.id} className="px-2 text-center text-xs italic text-white/50">
                    {m.text}
                  </p>
                )
              }
              if (m.kind === 'cards') {
                return (
                  <div key={m.id} className="pl-9">
                    <ResultCards cards={m.cards} onOpen={openCard} whatsapp={cardWhatsapp} />
                  </div>
                )
              }
              if (m.kind === 'whatsapp') {
                return waNumber ? (
                  <div key={m.id} className="pl-9">
                    <a
                      href={generalWhatsapp()}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={tapGeneralWhatsapp}
                      className="kevin-rise inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-[#06260f] shadow-lg transition hover:brightness-110"
                    >
                      <MessageCircle size={16} aria-hidden="true" />
                      {strings.whatsapp}
                    </a>
                  </div>
                ) : null
              }
              if (m.kind === 'picker') {
                return (
                  <div key={m.id} className="kevin-rise flex gap-2.5">
                    <span className="mt-0.5 block h-7 w-7 shrink-0"><Orb mini /></span>
                    <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.07] px-3.5 py-3 text-sm">
                      <p className="mb-3 leading-relaxed text-white/90">
                        <span className="font-display font-semibold text-white">Hello, I’m Kevin</span>, your guide to RealEVR
                        Estates. Which language would you like to speak?
                      </p>
                      <LanguagePicker onPick={chooseLanguage} />
                    </div>
                  </div>
                )
              }
              return m.role === 'kevin' ? (
                <div key={m.id} className="kevin-rise flex gap-2.5">
                  <span className="mt-0.5 block h-7 w-7 shrink-0"><Orb mini /></span>
                  <div
                    dir="auto"
                    className="max-w-[86%] rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.07] px-3.5 py-2.5 text-sm leading-relaxed text-white/90"
                  >
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="kevin-rise flex justify-end">
                  <div
                    dir="auto"
                    className="max-w-[86%] rounded-2xl rounded-tr-md bg-gradient-to-br from-[#f5c469] to-[#e39a34] px-3.5 py-2.5 text-sm leading-relaxed text-[#1b1305] shadow-md"
                  >
                    {m.text}
                  </div>
                </div>
              )
            })}
            {busy && (
              <div className="flex gap-2.5" role="status" aria-label={strings.thinking}>
                <span className="mt-0.5 block h-7 w-7 shrink-0"><Orb mini speaking /></span>
                <div className="rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.07] px-3.5 py-3">
                  <span className="kevin-dots"><span /><span /><span /></span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {!intakeDone && (
            <p className="border-t border-white/10 px-4 pt-2 text-center text-[11px] leading-snug text-white/50">
              {strings.shareNote}{' '}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-white/80" onClick={() => setOpen(false)}>
                {strings.privacy}
              </Link>
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 border-t border-white/10 p-3"
          >
            {voice.canListen && (
              <button
                type="button"
                onClick={() => (voice.listening ? voice.stopListening() : voice.listen({ onFinal: (text) => send(text) }))}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop listening' : 'Speak to Kevin'}
                title="Speak to Kevin"
                className={`shrink-0 rounded-full p-2.5 transition ${
                  voice.listening
                    ? 'bg-[#f5c469] text-[#1b1305]'
                    : 'border border-white/15 text-white/80 hover:border-[#f5c469]/70 hover:text-white'
                }`}
              >
                <Mic size={18} />
              </button>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={voice.listening ? strings.listening : strings.placeholder}
              dir={rtl ? 'rtl' : 'auto'}
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-base text-white placeholder:text-white/45 focus:border-[#f5c469]/70 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="shrink-0 rounded-full bg-[#f5c469] p-2.5 text-[#1b1305] transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </form>
            </>
          )}
        </div>
      )}
    </>
  )
}
