import { Keyboard } from 'lucide-react'
import Orb from './Orb'
import ResultCards from './ResultCards'
import type { KevinCard } from './kevinTypes'
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
}

/**
 * The hands-free view: a big orb, the words as they are heard, Kevin's short
 * answer, and the homes he found. The orb is the only control that matters:
 * tap to speak, tap while he talks to interrupt, just like a phone assistant.
 */
export default function VoiceStage({ phase, heard, reply, cards, strings, hint, notice, dir, onOrbTap, onOpenCard, onType }: VoiceStageProps) {
  const status =
    phase === 'listening' ? strings.listening : phase === 'thinking' ? strings.thinking : phase === 'idle' ? strings.tapToSpeak : ''
  const label = phase === 'speaking' ? 'Interrupt Kevin and speak' : phase === 'listening' ? 'Stop listening' : strings.talkToKevin

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-5 text-center">
        <button
          type="button"
          onClick={onOrbTap}
          aria-label={label}
          className="relative block h-36 w-36 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f5c469] md:h-40 md:w-40"
        >
          <Orb speaking={phase === 'speaking'} listening={phase === 'listening'} thinking={phase === 'thinking'} />
        </button>

        <p className="h-5 text-xs uppercase tracking-[0.22em] text-[#f5c469]" role="status">
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

        <div className="w-full max-w-[24rem]">
          <ResultCards cards={cards} onOpen={onOpenCard} />
        </div>
      </div>

      <div className="flex justify-center border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onType}
          className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-[#f5c469]/70 hover:text-white"
        >
          <Keyboard size={16} />
          {strings.typeInstead}
        </button>
      </div>
    </div>
  )
}
