import { Mic, MessageCircle } from 'lucide-react'
import Orb from './Orb'
import { openKevin } from './kevinEvents'

/**
 * Sits at the top of every sign-up and log-in card: Kevin, as someone who is there to help. Talking to him does not
 * need an account, and he stays with the visitor through the form and after it.
 */
export default function KevinSignupHelper({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const light = tone === 'light'
  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-xl border p-3 ${light ? 'border-amber-200 bg-amber-50/70' : 'border-white/10 bg-white/5'}`}
      data-testid="kevin-signup-helper"
    >
      <span className="mt-0.5 block h-9 w-9 shrink-0 rounded-full bg-[#0d1024] p-0.5">
        <Orb mini />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${light ? 'text-gray-900' : 'text-white'}`}>Kevin, your personal assistant</p>
        <p className={`text-xs leading-relaxed ${light ? 'text-gray-600' : 'text-white/70'}`}>
          Stuck, or not sure what to choose? I'm with you all the way, whether you rent, own, represent a company or want to sponsor.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openKevin({ context: 'signup', handsFree: true })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#36d399] px-3.5 text-sm font-semibold text-[#1b1305] transition hover:brightness-110"
          >
            <Mic size={14} aria-hidden="true" /> Talk to Kevin
          </button>
          <button
            type="button"
            onClick={() => openKevin({ context: 'signup' })}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition ${light ? 'border-gray-300 text-gray-700 hover:bg-white' : 'border-white/20 text-white/90 hover:bg-white/10'}`}
          >
            <MessageCircle size={14} aria-hidden="true" /> Chat
          </button>
        </div>
      </div>
    </div>
  )
}
