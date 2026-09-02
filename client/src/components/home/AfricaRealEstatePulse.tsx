import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useProperties } from '@/hooks/usePropertyData'

/**
 * "Real Estate Pulse — Africa": a live-updating panel attached to the hero
 * video space, mixing two REAL, honestly-sourced content types — never
 * fabricated "activity":
 *
 *  1. Real news headlines about real estate/property/housing across
 *     Africa, pulled server-side from NEWS_API_KEY (see
 *     server/gene/africa-media-feed.ts) — each card links out to the real
 *     source article with its real publisher name shown, exactly like any
 *     honest news aggregator.
 *  2. This platform's OWN current live listing photos (via the same
 *     useProperties() query Home.tsx and Hero.tsx already use — dedup'd,
 *     no extra request), clearly labeled "Live on RealEVR" rather than
 *     implied to be part of the news feed.
 *
 * If NEWS_API_KEY isn't configured AND there are no properties yet, this
 * renders nothing at all — no placeholder "coming soon" card, no fake
 * activity. That's a deliberate choice: a visibly-dead "live" panel is
 * worse than no panel, and an obviously-fake one erodes exactly the trust
 * this platform is trying to build (see the trust/credibility findings in
 * docs/GENE_PLATFORM.md's design-review rounds).
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

export default function AfricaRealEstatePulse() {
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
    const [isPaused, setIsPaused] = useState(false)

    useEffect(() => {
        if (cards.length < 2 || isPaused) return
        const timer = setInterval(() => setIndex((i) => (i + 1) % cards.length), ROTATE_MS)
        return () => clearInterval(timer)
    }, [cards.length, isPaused])

    useEffect(() => {
        if (index >= cards.length) setIndex(0)
    }, [cards.length, index])

    // Never fabricate activity — nothing configured and nothing live yet
    // means no panel, not a fake one.
    if (cards.length === 0) return null

    const card = cards[Math.min(index, cards.length - 1)]

    return (
        <div className="container mx-auto px-6 mt-8">
            <div
                className="relative rounded-2xl border border-border bg-card overflow-hidden shadow-sm max-w-2xl mx-auto md:mx-0"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
            >
                <div className="flex items-center gap-2 px-4 pt-3">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                    </span>
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Real Estate Pulse — Africa
                    </span>
                    {!newsState?.configured && (
                        <span className="ml-auto text-[10px] text-muted-foreground/70">Live RealEVR listings</span>
                    )}
                </div>

                <div className="relative h-56 md:h-64 mt-2">
                    {card.kind === 'news' ? (
                        <a
                            href={card.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block relative w-full h-full group"
                        >
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
                                    <i className="fas fa-newspaper text-3xl text-muted-foreground/40"></i>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                                <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-white/90 text-foreground rounded px-2 py-0.5 mb-2">
                                    {card.source}
                                </span>
                                <p className="text-white font-display text-sm md:text-base leading-snug line-clamp-2 group-hover:underline">
                                    {card.title}
                                </p>
                            </div>
                        </a>
                    ) : (
                        <Link href={`/property/${card.propertyId}`} className="block relative w-full h-full group">
                            <img
                                src={card.imageUrl}
                                alt={card.title}
                                loading="lazy"
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                            <div className="absolute top-3 left-3">
                                <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-600 text-white rounded px-2 py-0.5">
                                    Live on RealEVR
                                </span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                                <p className="text-white font-display text-sm md:text-base leading-snug line-clamp-1">
                                    {card.title}
                                </p>
                                <p className="text-white/80 text-xs">{card.location}</p>
                            </div>
                        </Link>
                    )}
                </div>

                {cards.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 py-3">
                        {cards.map((c, i) => (
                            <button
                                key={c.key}
                                onClick={() => setIndex(i)}
                                aria-label={`Show pulse item ${i + 1}`}
                                className={`h-1.5 rounded-full transition-all ${
                                    i === index ? 'w-6 bg-accent' : 'w-1.5 bg-border'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
