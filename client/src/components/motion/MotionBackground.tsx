/**
 * Ambient animated background — a handful of soft, blurred, slow-drifting
 * gradient blobs behind a section's content. Purely decorative: absolutely
 * positioned, `pointer-events-none`, and rendered behind everything else
 * (z-index handled by the caller giving its real content `relative z-10`).
 *
 * Perf-conscious by design: only `transform`/`opacity` are animated (GPU
 * compositable, never triggers layout), and the whole thing renders nothing
 * at all — not even a static version — when the user's OS has "reduce
 * motion" turned on, since a *static* blurry blob still adds paint cost for
 * zero benefit to someone who asked for less motion.
 */
import { motion, useReducedMotion } from 'framer-motion'

export type MotionBackgroundTone = 'accent' | 'warm' | 'quiet'

const TONE_BLOBS: Record<MotionBackgroundTone, { className: string }[]> = {
  // Hero — the most visible placement, so the richest tone. Pure grayscale
  // (NeoVision theme): every blob is white-on-black at varying opacity —
  // no hue anywhere, so the ambient motion reads as "light", not "color".
  accent: [
    { className: 'bg-accent/25 w-[32rem] h-[32rem] -left-40 -top-40' },
    { className: 'bg-white/12 w-[26rem] h-[26rem] right-0 top-10' },
    { className: 'bg-white/8 w-[22rem] h-[22rem] left-1/3 bottom-0' },
  ],
  // Secondary CTA bands — noticeable but quieter than the hero.
  warm: [
    { className: 'bg-accent/15 w-[26rem] h-[26rem] -left-20 top-0' },
    { className: 'bg-white/10 w-[20rem] h-[20rem] right-0 bottom-0' },
  ],
  // Barely-there texture for content-dense sections.
  quiet: [{ className: 'bg-accent/10 w-[24rem] h-[24rem] right-0 top-0' }],
}

export default function MotionBackground({
  tone = 'accent',
  className = '',
}: {
  tone?: MotionBackgroundTone
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  const blobs = TONE_BLOBS[tone]

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {blobs.map((blob, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${blob.className}`}
          animate={{
            x: [0, 24, -16, 0],
            y: [0, -20, 14, 0],
            scale: [1, 1.08, 0.96, 1],
          }}
          transition={{
            duration: 18 + i * 5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 1.5,
          }}
        />
      ))}
    </div>
  )
}
