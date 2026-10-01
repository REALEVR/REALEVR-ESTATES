import { useMemo } from 'react'
import { useFeaturedProperties } from '@/hooks/usePropertyData'
import './kevin.css'

/**
 * The backdrop of Kevin's listening screen: the featured homes drifting past, side to side, in slow rows
 * behind the dot. Only featured (boosted) listings appear, and only ones with a photo. It is decoration:
 * dimmed so the words stay readable, ignored by screen readers, never a tap target, and still for anyone
 * who asked their device for less motion. With no featured listing it renders nothing.
 */
const ROWS = 3
const MIN_TILES_PER_ROW = 6

export default function FeaturedWallpaper() {
  const { data } = useFeaturedProperties()

  const rows = useMemo(() => {
    const photos = (data ?? []).filter((p) => !!p.imageUrl)
    if (photos.length === 0) return []
    return Array.from({ length: ROWS }, (_, r) => {
      // Each row starts at a different home so the rows do not line up, and repeats the set until it fills the width.
      const shifted = photos.map((_, i) => photos[(i + r) % photos.length])
      const tiles = [...shifted]
      while (tiles.length < MIN_TILES_PER_ROW) tiles.push(...shifted)
      return tiles
    })
  }, [data])

  if (rows.length === 0) return null

  return (
    <div className="kevin-wall pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 flex flex-col justify-around py-4">
        {rows.map((tiles, r) => (
          <div key={r} className={`kevin-wall__row ${r % 2 === 1 ? 'is-reverse' : ''}`} style={{ animationDuration: `${70 + r * 18}s` }}>
            {/* The set twice over, so the loop has no seam. */}
            {[...tiles, ...tiles].map((p, i) => (
              <span key={`${p.id}-${i}`} className="kevin-wall__tile">
                <img src={p.imageUrl as string} alt="" loading="lazy" decoding="async" draggable={false} />
              </span>
            ))}
          </div>
        ))}
      </div>
      {/* Dim and fade so the dot, the transcript and the cards stay clear. */}
      <div className="absolute inset-0 bg-[#0b0d1c]/70" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgba(11,13,28,0.55),transparent_75%)]" />
    </div>
  )
}
