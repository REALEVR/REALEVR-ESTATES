import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, Mic, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { apiRequest } from '@/lib/queryClient'
import {
  KEVIN_LANGUAGES,
  hasBuiltInIntro,
  isRtl,
  languageFromText,
  stringsFor,
  type KevinLanguage,
} from './kevinLanguages'
import { useKevinVoice } from './useKevinVoice'
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
 * He talks to the same GENE backend as every other assistant here
 * (/api/gene/chat), asking for the Kevin persona; signed-in users also get a
 * shortcut to their personal "My Agent" panel, which used to have its own
 * floating button in this corner.
 */

const LANG_KEY = 'realevr_kevin_lang'
const GREETED_KEY = 'realevr_kevin_greeted'
const MUTED_KEY = 'realevr_kevin_muted'
const SESSION_KEY = 'realevr_gene_chat_session_id' // shared with the older widget so a thread survives
const COOKIE_KEY = 'realevr_cookie_consent'

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

// A message before it's been given an id (Omit distributed over the union, so
// each variant keeps its own fields).
type NewMessage = Message extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never

let messageId = 0
const nextId = () => ++messageId

function Orb({ speaking, listening, mini }: { speaking?: boolean; listening?: boolean; mini?: boolean }) {
  return (
    <span
      className={`kevin ${mini ? 'kevin--mini' : ''} ${speaking ? 'is-speaking' : ''} ${listening ? 'is-listening' : ''}`}
      aria-hidden="true"
    >
      <span className="kevin__ripple" />
      <span className="kevin__ripple" />
      <span className="kevin__ripple" />
      <span className="kevin__floor" />
      <span className="kevin__body">
        <span className="kevin__core">
          <span className="kevin__aurora" />
          <span className="kevin__aurora kevin__aurora--b" />
        </span>
        <span className="kevin__shade" />
        <span className="kevin__gloss" />
        <span className="kevin__ring" />
      </span>
    </span>
  )
}

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
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm text-white placeholder:text-white/45 focus:border-[#f5c469]/70 focus:outline-none"
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

  // Async flows below outlive the render they started in; refs keep them
  // reading the CURRENT language and mute setting, not a stale copy.
  const langRef = useRef(lang)
  langRef.current = lang
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const sessionIdRef = useRef<string>()
  if (!sessionIdRef.current) sessionIdRef.current = getSessionId()
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const noVoiceNotedFor = useRef<string | null>(null)

  const voice = useKevinVoice(lang?.bcp47 ?? null)
  const strings = stringsFor(lang)

  const push = useCallback((message: NewMessage) => {
    setMessages((prev) => [...prev, { ...message, id: nextId() } as Message])
  }, [])

  // Say it aloud if that's wanted and possible; otherwise, once per language,
  // tell the visitor Kevin is text-only for this one instead of just going quiet.
  const say = useCallback(
    (text: string, target: KevinLanguage | null) => {
      if (mutedRef.current || !voice.canSpeak) return
      const tag = target?.bcp47 ?? null
      if (voice.speak(text, tag)) return
      const key = target?.name ?? ''
      if (target && noVoiceNotedFor.current !== key && !voice.hasVoiceFor(tag)) {
        noVoiceNotedFor.current = key
        push({ kind: 'note', text: stringsFor(target).noVoice.replace('{lang}', target.native) })
      }
    },
    [voice, push],
  )

  const kevinSays = useCallback(
    (text: string, target: KevinLanguage | null = langRef.current) => {
      push({ kind: 'text', role: 'kevin', text })
      say(text, target)
    },
    [push, say],
  )

  // ---- First-visit greeting: wait for the cookie notice to be dealt with ----
  useEffect(() => {
    if (readStore(GREETED_KEY)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const started = Date.now()
    const tick = () => {
      if (cancelled) return
      const settled = !!readStore(COOKIE_KEY) || Date.now() - started > 20_000
      if (settled) {
        timer = setTimeout(() => {
          if (cancelled) return
          writeStore(GREETED_KEY, '1')
          setBubble(true)
        }, 1500)
      } else {
        timer = setTimeout(tick, 600)
      }
    }
    timer = setTimeout(tick, 2500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

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
        return [{ id: nextId(), kind: 'text', role: 'kevin', text: stringsFor(langRef.current).intro }]
      }
      return [{ id: nextId(), kind: 'picker' }]
    })
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [open])

  const closePanel = () => {
    voice.stop()
    voice.stopListening()
    setOpen(false)
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

    let intro = stringsFor(picked).intro
    if (!hasBuiltInIntro(picked)) {
      // Languages we don't ship an introduction for: the AI writes it.
      setBusy(true)
      try {
        const res = await apiRequest('POST', '/api/gene/chat', {
          intro: true,
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

  const send = async (raw: string) => {
    const message = raw.trim()
    if (!message || busy) return
    voice.stop()
    setInput('')
    setMessages((prev) => [...prev.filter((m) => m.kind !== 'picker'), { id: nextId(), kind: 'text', role: 'user', text: message }])
    setBusy(true)
    try {
      const current = langRef.current
      const res = await apiRequest('POST', '/api/gene/chat', {
        message,
        sessionId: sessionIdRef.current,
        persona: 'kevin',
        ...(current ? { language: { code: current.code, name: current.name } } : {}),
      })
      const data = await res.json()
      if (typeof data.sessionId === 'string') sessionIdRef.current = data.sessionId
      kevinSays(typeof data.reply === 'string' && data.reply ? data.reply : stringsFor(current).error)
    } catch {
      kevinSays(stringsFor(langRef.current).error)
    } finally {
      setBusy(false)
    }
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    writeStore(MUTED_KEY, next ? '1' : '0')
    if (next) voice.stop()
  }

  const openMyAgent = () => {
    closePanel()
    window.dispatchEvent(new Event('realevr:open-agent'))
  }

  // Pointer tilt: the orb leans toward the cursor (mouse only, so touch stays still).
  const tilt = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    e.currentTarget.style.setProperty('--kevin-tilt-x', `${(-y * 24).toFixed(1)}deg`)
    e.currentTarget.style.setProperty('--kevin-tilt-y', `${(x * 24).toFixed(1)}deg`)
  }
  const untilt = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty('--kevin-tilt-x', '0deg')
    e.currentTarget.style.setProperty('--kevin-tilt-y', '0deg')
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
            setBubble(false)
            setOpen(true)
          }}
          onPointerMove={tilt}
          onPointerLeave={untilt}
          aria-label="Chat with Kevin, your RealEVR concierge"
          className="group fixed bottom-[var(--fab-row-1)] right-5 z-40 h-14 w-14 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5c469] md:bottom-5 md:right-4 md:h-16 md:w-16"
        >
          <Orb speaking={voice.speaking} listening={voice.listening} />
          <span className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#0d1024]/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 md:block">
            Ask Kevin
          </span>
        </button>
      )}

      {/* First-visit greeting */}
      {bubble && !open && (
        <div
          role="dialog"
          aria-label="Kevin says hello"
          className="kevin-pop fixed bottom-[calc(var(--fab-row-1)+4.25rem)] right-3 z-[45] w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-white/10 bg-[#0d1024]/95 p-4 text-white shadow-2xl backdrop-blur-xl md:bottom-[6.25rem] md:right-4"
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
          className="kevin-pop fixed inset-x-3 bottom-[calc(var(--mobile-tabbar-h)+0.75rem)] z-[55] flex h-[min(76vh,640px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(79,70,229,0.28),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(45,212,191,0.18),transparent_55%)] bg-[#0b0d1c]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl md:inset-x-auto md:bottom-5 md:right-4 md:h-[min(640px,calc(100vh-2.5rem))] md:w-[400px]"
        >
          <header className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
            <span className="relative block h-10 w-10 shrink-0">
              <Orb mini speaking={voice.speaking} listening={voice.listening} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-semibold tracking-wide">Kevin</span>
                <span className={`kevin-bars ${voice.speaking ? 'is-on' : ''}`} aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </span>
              </div>
              <p className="truncate text-xs text-white/60">Your RealEVR concierge</p>
            </div>
            {user && (
              <button
                type="button"
                onClick={openMyAgent}
                title="My picks and alerts"
                aria-label="Open my picks and alerts"
                className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-[#f5c469]"
              >
                <Sparkles size={18} />
              </button>
            )}
            {voice.canSpeak && (
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? 'Let Kevin speak aloud' : 'Mute Kevin'}
                title={muted ? 'Let Kevin speak aloud' : 'Mute Kevin'}
                className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setChangingLanguage((v) => !v)}
              aria-expanded={showPicker}
              title="Change language"
              className="flex max-w-[6.5rem] items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1.5 text-xs text-white/85 transition hover:border-[#f5c469]/70 hover:text-white"
            >
              <Globe size={14} className="shrink-0" />
              <span className="truncate" lang={lang?.code ?? undefined}>{lang?.native ?? 'Language'}</span>
            </button>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </header>

          {showPicker && (
            <div className="kevin-rise border-b border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-white/50">Choose a language</p>
              <LanguagePicker onPick={chooseLanguage} />
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((m) => {
              if (m.kind === 'note') {
                return (
                  <p key={m.id} className="px-2 text-center text-xs italic text-white/50">
                    {m.text}
                  </p>
                )
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
                onClick={() => (voice.listening ? voice.stopListening() : voice.listen((text) => send(text)))}
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
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#f5c469]/70 focus:outline-none"
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
        </div>
      )}
    </>
  )
}
