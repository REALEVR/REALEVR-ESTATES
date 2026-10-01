/**
 * The sheet of glass that sweeps up the screen on every page change (full mode only). It is translucent and
 * pointer-events:none, so it never blocks a tap and never hides the page for long: it is a passing wave, not a
 * loading screen. The new page's blocks then rise and come into focus one after another (see useReveal in FxRoot).
 * Idea adapted from React Bits' transition components (PixelTransition, GooeyNav); built with framer-motion only.
 */
import { useRef } from 'react'
import { motion } from 'framer-motion'
import { useFxMode } from './fxMode'

export default function LiquidPageSweep({ routeKey }: { routeKey: string }) {
    const mode = useFxMode()
    const initial = useRef(routeKey)
    const moved = useRef(false)
    if (routeKey !== initial.current) moved.current = true
    if (mode !== 'full' || !moved.current) return null
    return (
        <motion.div
            key={routeKey}
            className="fx-sweep"
            aria-hidden="true"
            initial={{ y: '100%', opacity: 0.95 }}
            animate={{ y: ['100%', '-4%', '-108%'], opacity: [0.95, 0.95, 0] }}
            transition={{ duration: 0.85, times: [0, 0.42, 1], ease: [0.65, 0, 0.35, 1] }}
        />
    )
}
