/**
 * Animates a number counting up from 0 the moment it scrolls into view —
 * used for the hero's "1,000+ listings / 98% satisfaction" stats. Renders
 * the final value immediately (no animation) when reduced-motion is on, so
 * the number is never *missing*, just not counting.
 */
import { useEffect, useRef } from 'react'
import { motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'

export default function CountUp({
  value,
  suffix = '',
  className = '',
  duration = 1.4,
}: {
  value: number
  suffix?: string
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { duration: duration * 1000, bounce: 0 })

  useEffect(() => {
    if (inView) motionValue.set(value)
  }, [inView, value, motionValue])

  useEffect(() => {
    return spring.on('change', (latest) => {
      if (ref.current) ref.current.textContent = `${Math.round(latest).toLocaleString()}${suffix}`
    })
  }, [spring, suffix])

  if (reduceMotion) {
    return (
      <span className={className}>
        {value.toLocaleString()}
        {suffix}
      </span>
    )
  }

  return (
    <motion.span ref={ref} className={className}>
      0{suffix}
    </motion.span>
  )
}
