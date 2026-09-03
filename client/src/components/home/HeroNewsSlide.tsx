import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useProperties } from '@/hooks/usePropertyData'

/**
 * "Real Estate Pulse — Africa" news/listings feed, rendered as the second
 * slide of Hero's video/tour container (see Hero.tsx — "let the news be put
 * where the video is... let the 2 slide as part of the same container").
 * Used to be its own standalone section below the hero
 * (AfricaRealEstatePulse.tsx, now folded into this component) — moved
 * in-place instead so the video and the news feed share one slide
 * container above the search bar, rather than the news feed being a
 * separate block further down the page.
 *
 * Mixes two REAL, honestly-sourced content types, never fabricated
 * "activity": real Africa property/housing news (server-side, only when
 * NEWS_API_KEY is configured — see server/gene/africa-media-feed.ts), and
 * this platform's own current live listing photos, clearly labeled "Live
 * on RealEVR" rather than implied to be part of the news feed. Renders
 * nothing (null) if neither source has content — a dead "live" panel is
 * worse than no panel.
 */

interface NewsItem {
    title: string
    url: string
    source: string
    publishedAt: string
    description?: string
    imageUrl?: string
}

type PulseCard =
    | { kind: 'news'; key: string; title: string; url: string; source: string; imageUrl?: string }
    | {
          kind: 'listing'
          key: string
          title: string
          location: string
          imageUrl: string
          propertyId: number | string
      }

const ROTATE_MS = 6000

export default function HeroNewsSlide({ active }: { active: boolean }) {
    const [newsState, setNewsState] = useState<{ configured: boolean; items: NewsItem[] } | null>(null)
    const { data: properties } = useProperties()

    useEffect(() => {
        let cancelled = false
        fetch('/api/gene/africa-media-feed')
            .then((r) => (r.ok ? r.json() : { configured: false, items: [] }))
            .then((data) => {
                if (!cancelled) setNewsState(data)
            })
            .catch(() => {
                if (!cancelled) setNewsState({ configured: false, items: [] })
            })
        return () => {
            cancelled = true
        }
    }, [])

    const cards: PulseCard[] = useMemo(() => {
        const newsCards: PulseCard[] = (newsState?.items ?? [])
            .filter((n) => n.title)
            .slice(0, 8)
            .map((n, i) => ({
                kind: 'news',
                key: `news-${i}-${n.url}`,
                title: n.title,
                url: n.url,
                source: n.source,
                imageUrl: n.imageUrl,
            }))

        const listingCards: PulseCard[] = (properties ?? [])
            .filter((p) => p.title && p.title.trim() !== '' && p.imageUrl)
            .slice(0, 6)
            .map((p) => ({
                kind: 'listing',
                key: `listing-${p.id}`,
                title: p.title,
                location: p.location,
                imageUrl: p.imageUrl,
                propertyId: p.id,
            }))

        // Interleave rather than clump news-then-listings, so the panel
        // reads as one mixed feed rather than two stacked lists.
        const merged: PulseCard[] = []
        const maxLen = Math.max(newsCards.length, listingCards.length)
        for (let i = 0; i < maxLen; i++) {
            if (newsCards[i]) merged.push(newsCards[i])
            if (listingCards[i]) merged.push(listingCards[i])
        }
        return merged
    }, [newsState, properties])

    const [index, setIndex] = useState(0)

    // Only rotate through its own cards while this slide is the one showing
    // — no point burning a timer (or surprising the visitor with a jump)
    // cycling cards behind the video.
    useEffect(() => {
        if (!active || cards.length < 2) return
        const timer = setInterval(() => setIndex((i) => (i + 1) % cards.length), ROTATE_MS)
        return () => clearInterval(timer)
    }, [active, cards.length])

    useEffect(() => {
        if (index >= cards.length) setIndex(0)
    }, [cards.length, index])

    if (cards.length === 0) return null

    const card = cards[Math.min(index, cards.length - 1)]

    return (
        <div className="relative w-full h-full">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
                <span className="text-xs font-semibold tracking-wide text-white uppercase">Real Estate Pulse — Africa</span>
            </div>

            {card.kind === 'news' ? (
                <a href={card.url} target="_blank" rel="noopener noreferrer" className="block relative w-full h-full group">
                    {card.imageUrl ? (
                        <img
                            src={card.imageUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                        />
                    ) : (
                        <div className="w-full h-full bg-secondary flex items-center justify-center">
                            <i className="fas fa-newspaper text-4xl text-muted-foreground/40"></i>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-white/90 text-foreground rounded px-2 py-0.5 mb-2">
                            {card.source}
                        </span>
                        <p className="text-white font-display text-base md:text-lg leading-snug line-clamp-2 group-hover:underline">
                            {card.title}
                        </p>
                    </div>
                </a>
            ) : (
                <Link href={`/property/${card.propertyId}`} className="block relative w-full h-full group">
                    <img src={card.imageUrl} alt={card.title} loading="lazy" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute top-4 right-4">
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-600 text-white rounded px-2 py-0.5">
                            Live on RealEVR
                        </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                        <p className="text-white font-display text-base md:text-lg leading-snug line-clamp-1">{card.title}</p>
                        <p className="text-white/80 text-sm">{card.location}</p>
                    </div>
                </Link>
            )}
        </div>
    )
}
