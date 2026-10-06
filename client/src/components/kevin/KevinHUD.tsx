import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, MapPin, Mic, MicOff, X } from 'lucide-react'
import { HudSphere, HudWave, type HudMode } from './HudCanvas'
import { compactMoney, marketPulse } from './hudCommands'
import { formatPrice, type KevinCard } from './kevinTypes'

export interface HudLogEntry {
  id: number
  at: number
  kind: 'heard' | 'kevin' | 'action'
  text: string
}

interface Place {
  count: number
  cities: { name: string; count: number }[]
}

const STATUS: Record<HudMode, string> = { idle: 'Standing by', listening: 'Listening', thinking: 'Working on it', speaking: 'Speaking' }

const SUGGESTIONS = ['Two bedroom homes in Kololo under three million', 'Cheapest BnB in Kampala', 'Show me homes for sale in Nairobi', 'How do bank auctions work?']

/** A panel with the four corner brackets of an instrument. */
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`relative border border-[#f5c469]/20 bg-[#0b0d1c]/65 p-3 backdrop-blur-sm ${className}`}>
      {(['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'] as const).map((c) => (
        <span key={c} aria-hidden="true" className={`pointer-events-none absolute h-2.5 w-2.5 border-[#f5c469] ${c}`} />
      ))}
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f5c469]">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-1 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-white/45">{label}</span>
      <span className="font-mono text-[13px] tabular-nums text-white">{value}</span>
    </div>
  )
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** What the platform holds right now, from the open listings API (the same data AI assistants see). */
function usePlatform(): { homes: number; countries: number; cities: number } | null {
  const [data, setData] = useState<{ homes: number; countries: number; cities: number } | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/public-api/v1/places')
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: Place[] | null) => {
        if (!alive || !Array.isArray(rows)) return
        setData({
          homes: rows.reduce((n, c) => n + (c.count || 0), 0),
          countries: rows.length,
          cities: rows.reduce((n, c) => n + (c.cities?.length || 0), 0),
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return data
}

interface KevinHudProps {
  mode: HudMode
  /** What he is hearing right now, live. */
  heard: string
  /** The last thing he said. */
  reply: string
  /** The last thing the visitor asked, kept on the card after the answer arrives. */
  asked: string
  cards: KevinCard[]
  log: HudLogEntry[]
  micOn: boolean
  languageName: string
  busy: boolean
  onClose: () => void
  onSend: (text: string) => void
  onOpenCard: (id: number) => void
  /** Open the full results page for the last search, when there was one. */
  onOpenResults: (() => void) | null
  /** Tap the sphere: interrupt him if he is talking, otherwise turn the microphone on. */
  onTapCore: () => void
}

/**
 * Jarvis mode: a command centre Kevin opens when asked ("Kevin, Jarvis mode"). The sphere shows what he is doing, the
 * panels show real data (what the platform holds, what he found, a log of what he did), and the card at the bottom is
 * the conversation. Opening it is the visitor's choice; it never appears by itself, and Esc or "close" puts it away.
 */
export default function KevinHUD({ mode, heard, reply, asked, cards, log, micOn, languageName, busy, onClose, onSend, onOpenCard, onOpenResults, onTapCore }: KevinHudProps) {
  const clock = useClock()
  const platform = usePlatform()
  const pulse = useMemo(() => marketPulse(cards), [cards])
  const [typed, setTyped] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const logEndRef = useRef<HTMLUListElement>(null)

  // Keyboard focus lands inside, the page behind does not scroll, and Esc puts it away; focus goes back to where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = logEndRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log.length])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = typed.trim()
    if (!text || busy) return
    setTyped('')
    onSend(text)
  }

  const showing = heard || (mode === 'thinking' ? asked : '')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kevin command centre"
      className="fixed inset-0 z-[2000] flex flex-col overflow-hidden bg-[#05060f] text-white"
      style={{ backgroundImage: 'radial-gradient(ellipse at 50% 38%, rgba(245,196,105,0.10), transparent 62%), linear-gradient(rgba(245,196,105,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(245,196,105,0.035) 1px, transparent 1px)', backgroundSize: 'auto, 44px 44px, 44px 44px' }}
    >
      <header className="flex items-center gap-3 border-b border-[#f5c469]/15 px-4 py-2.5 md:px-6">
        <span className={`h-2 w-2 rounded-full ${micOn ? 'bg-[#f5c469] motion-safe:animate-pulse' : 'bg-white/30'}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold uppercase tracking-[0.3em] text-[#f5c469]">Kevin<span className="hidden sm:inline"> · Property intelligence</span></div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{micOn ? 'Online · microphone open' : 'Online · microphone off'}</div>
        </div>
        <time className="hidden font-mono text-sm tabular-nums text-white/70 sm:block" aria-label="Local time">
          {clock}
        </time>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close command centre"
          className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/80 transition hover:border-[#f5c469]/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5c469]"
        >
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="grid gap-3 p-3 md:p-5 lg:h-full lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        {/* Left: systems, platform, log */}
        <div className="order-3 flex min-w-0 flex-col gap-3 lg:order-1 lg:min-h-0">
          <Panel title="Systems">
            <Stat label="State" value={STATUS[mode]} />
            <Stat label="Microphone" value={micOn ? 'Open' : 'Off'} />
            <Stat label="Language" value={languageName} />
          </Panel>
          <Panel title="Platform">
            <Stat label="Homes live" value={platform ? platform.homes : '…'} />
            <Stat label="Countries" value={platform ? platform.countries : '…'} />
            <Stat label="Cities" value={platform ? platform.cities : '…'} />
          </Panel>
          <Panel title="Activity" className="flex min-h-[8rem] flex-col lg:flex-1">
            <ul ref={logEndRef} className="max-h-48 space-y-1.5 overflow-y-auto pr-1 font-mono text-[11px] leading-snug lg:min-h-0 lg:max-h-none lg:flex-1" aria-label="What Kevin has done">
              {log.length === 0 && <li className="text-white/35">Nothing yet. Ask him for a home.</li>}
              {log.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 text-white/30">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
                  <span className={e.kind === 'heard' ? 'text-white/80' : e.kind === 'action' ? 'text-[#ff9f1c]' : 'text-[#f5c469]'}>{e.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* Centre: the core and the conversation */}
        <div className="order-1 flex min-w-0 flex-col items-center lg:order-2 lg:min-h-0 lg:justify-center">
          <button
            type="button"
            onClick={onTapCore}
            aria-label={mode === 'speaking' ? 'Interrupt Kevin' : micOn ? 'Kevin is listening' : 'Turn the microphone on'}
            className="relative aspect-square w-[min(100%,26rem)] shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5c469] lg:w-[min(32rem,46vh)]"
          >
            <HudSphere mode={mode} />
          </button>
          <p className="-mt-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#f5c469]" role="status">
            {STATUS[mode]}
          </p>
          <div className="mt-2 w-full max-w-[32rem]">
            <HudWave mode={mode} />
          </div>

          <div className="mt-2 w-full min-w-0 max-w-[40rem] break-words border border-[#f5c469]/25 bg-[#0b0d1c]/75 p-3 backdrop-blur-sm" aria-live="polite">
            {showing ? (
              <p dir="auto" className="text-[15px] leading-snug text-white">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">You</span>
                {showing}
              </p>
            ) : (
              <>
                {asked && (
                  <p dir="auto" className="mb-1 truncate text-[12px] text-white/45">
                    <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.2em]">You</span>
                    {asked}
                  </p>
                )}
                <p dir="auto" className="text-[15px] leading-snug text-white/90">
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f5c469]">Kevin</span>
                  {reply || 'Go ahead. Ask me about any home, area or price.'}
                </p>
              </>
            )}
          </div>

          <div className="mt-2 flex w-full max-w-[40rem] flex-wrap justify-center gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => onSend(s)}
                className="rounded-full border border-white/15 px-3 py-1 text-[12px] text-white/70 transition hover:border-[#f5c469]/70 hover:text-white disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-2 flex w-full max-w-[40rem] items-center gap-2">
            <label htmlFor="kevin-hud-input" className="sr-only">
              Type to Kevin
            </label>
            <input
              id="kevin-hud-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type a command…"
              enterKeyHint="send"
              autoComplete="off"
              className="min-h-11 flex-1 border border-white/15 bg-[#0b0d1c]/70 px-3 text-[14px] text-white placeholder:text-white/35 focus:border-[#f5c469]/70 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!typed.trim() || busy}
              aria-label="Send"
              className="grid h-11 w-11 place-items-center bg-[#f5c469] text-[#1b1305] transition hover:brightness-110 disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </button>
            <button
              type="button"
              onClick={onTapCore}
              aria-label={micOn ? 'Microphone is on' : 'Turn the microphone on'}
              className="grid h-11 w-11 place-items-center border border-white/15 text-white/80 transition hover:border-[#f5c469]/70"
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </form>
        </div>

        {/* Right: what he found */}
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-3 lg:min-h-0">
          <Panel title="Market pulse">
            {pulse ? (
              <>
                <Stat label="Homes shown" value={pulse.count} />
                <Stat label="Lowest" value={`${pulse.currency} ${compactMoney(pulse.min)}`} />
                <Stat label="Median" value={`${pulse.currency} ${compactMoney(pulse.median)}`} />
                <Stat label="Highest" value={`${pulse.currency} ${compactMoney(pulse.max)}`} />
              </>
            ) : (
              <p className="text-[12px] leading-snug text-white/40">Ask for homes in an area and the spread of prices shows here.</p>
            )}
          </Panel>
          <Panel title={`Matches${cards.length ? ` · ${cards.length}` : ''}`} className="flex flex-col lg:min-h-0 lg:flex-1">
            {cards.length === 0 ? (
              <p className="text-[12px] leading-snug text-white/40">Homes he finds appear here. Tap one to open it.</p>
            ) : (
              <ul className="space-y-2 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" aria-label="Homes Kevin found">
                {cards.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCard(c.id)}
                      className="group flex w-full gap-2.5 border border-white/10 p-1.5 text-left transition hover:border-[#f5c469]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f5c469]"
                    >
                      <span className="block h-14 w-[4.5rem] shrink-0 overflow-hidden bg-white/5">
                        {c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-white">{c.title}</span>
                        <span className="flex items-center gap-1 truncate text-[11px] text-white/50">
                          <MapPin size={10} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{c.location}</span>
                        </span>
                        <span className="block truncate font-mono text-[11px] text-[#f5c469]">{formatPrice(c)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {onOpenResults && cards.length > 0 && (
              <button
                type="button"
                onClick={onOpenResults}
                className="mt-2 w-full border border-[#f5c469]/50 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f5c469] transition hover:bg-[#f5c469]/10"
              >
                Open full results
              </button>
            )}
          </Panel>
        </div>
        </div>
      </div>
    </div>
  )
}
