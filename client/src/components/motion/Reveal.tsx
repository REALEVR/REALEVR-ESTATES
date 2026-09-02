/**
 * Scroll-triggered reveal wrapper — fades/slides a section in the moment it
 * enters the viewport, rather than all at once on page load (the effect the
 * existing FadeIn/SlideInUp in animated-components.tsx give you). This is
 * what actually reads as "interactive while scrolling" rather than "the
 * page loaded with a fade".
 *
 * `viewport={{ once: true }}` — plays once per section, never re-triggers
 * on scroll-up, so it never feels janky/repetitive on a long page.
 * Respects prefers-reduced-motion via framer-motion's own reducedMotion
 * config (see MotionConfig in App.tsx) — no separate check needed here.
 */
import { ReactNode } from 'react'
import { motion } from 'framer-motion'

type RevealDirection = 'up' | 'left' | 'right' | 'fade'

const OFFSET: Record<RevealDirection, { x?: number; y?: number }> = {
  up: { y: 28 },
  left: { x: -28 },
  right: { x: 28 },
  fade: {},
}

export default function Reveal({
  children,
  className = '',
  direction = 'up',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  direction?: RevealDirection
  delay?: number
}) {
  const offset = OFFSET[direction]
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
