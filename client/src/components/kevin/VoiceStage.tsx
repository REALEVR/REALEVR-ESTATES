import { Keyboard } from 'lucide-react'
import Orb from './Orb'
import FeaturedWallpaper from './FeaturedWallpaper'
import ResultCards from './ResultCards'
import type { KevinCard } from './kevinTypes'
import { MessageCircle } from 'lucide-react'
import type { KevinStrings } from './kevinLanguages'

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking'

interface VoiceStageProps {
  phase: VoicePhase
  /** What Kevin is hearing right now, live. */
  heard: string
  /** The last thing Kevin said. */
  reply: string
  cards: KevinCard[]
  strings: KevinStrings
  /** Example phrase shown while idle (English only; we have no vetted translations). */
  hint: string | null
  /** Shown when this device cannot speak the chosen language aloud. */
  notice: string | null
  dir: 'rtl' | 'auto'
  onOrbTap: () => void
  onOpenCard: (id: number) => void
  onType: () => void
  /** Shown instead of "tap to speak" while hands-free is keeping the microphone open. */
  idleLabel?: string
  /** Per-card "ask on WhatsApp" buttons. */
  cardWhatsapp?: Parameters<typeof ResultCards>[0]['whatsapp']
  /** A general "message us on WhatsApp" button, shown when Kevin offers it. */
  offer?: { label: string; href: string; onTap: () => void } | null
}

/**
 * The hands-free view: Kevin's dot over a slow drift of featured homes, the words as they are heard, Kevin's short
 * answer, and the homes he found. The orb is the only control that matters:
 * tap to speak, tap while he talks to interrupt, just like a phone assistant.
 */
export default function VoiceStage({ phase, heard, reply, cards, strings, hint, notice, dir, onOrbTap, onOpenCard, onType, idleLabel, cardWhatsapp, offer }: VoiceStageProps) {
  const status =
    phase === 'listening' ? strings.listening : phase === 'thinking' ? strings.thinking : phase === 'idle' ? idleLabel ?? strings.tapToSpeak : ''
  const label = phase === 'speaking' ? 'Interrupt Kevin and speak' : phase === 'listening' ? 'Stop listening' : strings.talkToKevin

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <FeaturedWallpaper />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-5 text-center">
        <button
          type="button"
          onClick={onOrbTap}
          aria-label={label}
          className="relative block h-28 w-28 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#36d399] md:h-32 md:w-32 [@media(max-height:520px)]:h-16 [@media(max-height:520px)]:w-16"
        >
          <Orb speaking={phase === 'speaking'} listening={phase === 'listening'} thinking={phase === 'thinking'} />
        </button>

        <p className="h-5 text-xs uppercase tracking-[0.22em] text-[#36d399]" role="status">
          {status}
        </p>

        {/* Live transcript: shown while listening, then until the answer replaces it. */}
        <p
          dir="auto"
          className="min-h-[2.5rem] max-w-[22rem] text-lg font-medium leading-snug text-white"
          aria-live="polite"
        >
          {heard}
        </p>

        {phase === 'idle' && !heard && !reply && hint && (
          <p className="max-w-[20rem] text-sm italic text-white/55">Try: “{hint}”</p>
        )}

        {notice && <p className="max-w-[20rem] text-xs italic text-white/50">{notice}</p>}

        {reply && !heard && (
          <p dir={dir} className="kevin-rise max-w-[22rem] text-sm leading-relaxed text-white/75">
            {reply}
          </p>
        )}

        {offer && (
          <a
            href={offer.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={offer.onTap}
            className="kevin-rise inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-[#06260f] shadow-lg transition hover:brightness-110"
          >
            <MessageCircle size={16} aria-hidden="true" />
            {offer.label}
          </a>
        )}

        <div className="w-full max-w-[24rem]">
          <ResultCards cards={cards} onOpen={onOpenCard} whatsapp={cardWhatsapp} />
        </div>
      </div>

      <div className="relative z-10 flex justify-center border-t border-white/10 bg-[#0b0d1c]/60 p-3 backdrop-blur">
        <button
          type="button"
          onClick={onType}
          className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-[#36d399]/70 hover:text-white"
        >
          <Keyboard size={16} />
          {strings.typeInstead}
        </button>
      </div>
    </div>
  )
}
