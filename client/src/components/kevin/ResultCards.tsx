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
    <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Homes Kevin found">
      {cards.map((card) => (
        <li key={card.id} className="w-48 shrink-0">
          <button
            type="button"
            onClick={() => onOpen(card.id)}
            className="kevin-rise group block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f5c469]"
          >
            <span className="block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white/5">
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
            <span className="block space-y-0.5 px-0.5 pt-2.5">
              <span className="block truncate text-[14px] font-medium text-white">{card.title}</span>
              <span className="flex items-center gap-1 truncate text-[12px] text-white/50">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{card.location}</span>
                {card.bedrooms > 0 && (
                  <>
                    <BedDouble size={11} className="ml-1 shrink-0" />
                    {card.bedrooms}
                  </>
                )}
              </span>
              <span className="block truncate pt-0.5 text-[13px] font-medium text-white/90">{formatPrice(card)}</span>
            </span>
          </button>
          {whatsapp && (
            <a
              href={whatsapp.href(card)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => whatsapp.onTap(card)}
              className="mt-2 flex min-h-9 items-center gap-1.5 px-0.5 text-[12px] font-medium text-[#7ae6a0] transition hover:text-[#a5f2c1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25D366]"
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
