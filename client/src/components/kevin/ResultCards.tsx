import { BedDouble, MapPin, MessageCircle } from 'lucide-react'
import { formatPrice, type KevinCard } from './kevinTypes'

/** The homes Kevin found, as tappable cards. Spoken answers stay short because these carry the detail. */
export default function ResultCards({
  cards,
  onOpen,
  whatsapp,
}: {
  cards: KevinCard[]
  onOpen: (id: number) => void
  /** When set, each card gets a button that opens a WhatsApp chat about that home. */
  whatsapp?: { label: string; href: (card: KevinCard) => string; onTap: (card: KevinCard) => void } | null
}) {
  if (cards.length === 0) return null
  return (
    <ul className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Homes Kevin found">
      {cards.map((card) => (
        <li key={card.id} className="w-44 shrink-0">
          <button
            type="button"
            onClick={() => onOpen(card.id)}
            className="kevin-rise group block w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] text-left transition hover:border-[#f5c469]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f5c469]"
          >
            <span className="block h-24 w-full overflow-hidden bg-white/5">
              {card.imageUrl && (
                <img
                  src={card.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              )}
            </span>
            <span className="block space-y-0.5 px-3 py-2">
              <span className="block truncate text-sm font-medium text-white">{card.title}</span>
              <span className="flex items-center gap-1 truncate text-xs text-white/60">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{card.location}</span>
                {card.bedrooms > 0 && (
                  <>
                    <BedDouble size={11} className="ml-1 shrink-0" />
                    {card.bedrooms}
                  </>
                )}
              </span>
              <span className="block truncate text-xs font-semibold text-[#f5c469]">{formatPrice(card)}</span>
            </span>
          </button>
          {whatsapp && (
            <a
              href={whatsapp.href(card)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => whatsapp.onTap(card)}
              className="mt-1.5 flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-[#25D366]/15 px-3 text-xs font-medium text-[#6ee79a] transition hover:bg-[#25D366]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25D366]"
            >
              <MessageCircle size={13} aria-hidden="true" />
              <span className="truncate">{whatsapp.label}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
